import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Last path segment of the dev-server endpoint the client calls. */
export const ENDPOINT = '__claude-open'

/** Where the signal file lives, relative to the workspace root. */
export const DEFAULT_SIGNAL_FILE = 'node_modules/.cache/claude-locator/open.json'

/** What the endpoint writes and the Claude Code plugin reads. */
export interface OpenSignal {
  /** Absolute path of the source file. */
  file: string
  line?: number
  column?: number
  /** `Date.now()` when the click arrived; the Claude Code plugin opens each `at` once. */
  at: number
}

const isInside = (child: string, parent: string): boolean => {
  const relative = path.relative(parent, child)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

const realPathOrSelf = (target: string): string => {
  try {
    return fs.realpathSync(target)
  } catch {
    return target
  }
}

const isFile = (target: string): boolean => {
  try {
    return fs.statSync(target).isFile()
  } catch {
    return false
  }
}

/**
 * Resolves the `file` the client sent (absolute, or relative to the workspace root, or to the project root where
 * a framework writes paths that way, as Angular does) to an absolute path of an existing file inside the
 * workspace, or `undefined`.
 */
export const resolveSourceFile = (file: string, workspaceRoot: string, projectRoot?: string): string | undefined => {
  if (!file || file.includes('\0')) {
    return undefined
  }
  const root = realPathOrSelf(path.resolve(workspaceRoot))
  const bases = projectRoot && !path.isAbsolute(file) ? [root, path.resolve(projectRoot)] : [root]
  for (const base of bases) {
    const target = realPathOrSelf(path.resolve(base, file))
    if (isInside(target, root) && isFile(target)) {
      return target
    }
  }
  return undefined
}

const positiveInt = (value: string | null): number | undefined => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** Writes the signal in one rename, so a reader never sees half a file. */
export const writeSignal = (signalFile: string, signal: OpenSignal): void => {
  fs.mkdirSync(path.dirname(signalFile), { recursive: true })
  const temp = `${signalFile}.${process.pid}.tmp`
  fs.writeFileSync(temp, JSON.stringify(signal))
  fs.renameSync(temp, signalFile)
}

/** Opens a location somewhere: the Claude desktop app, an editor, a callback of the user's. */
export type Opener = (signal: OpenSignal) => void | Promise<void>

/** Hands the location to the Claude Code plugin through the signal file. */
export const claudeOpener =
  (signalFile: string): Opener =>
  (signal) =>
    writeSignal(signalFile, signal)

export interface OpenHandlerOptions {
  workspaceRoot: string
  /** Where relative paths may also start from. */
  projectRoot?: string
  openers: Opener[]
  /**
   * The pages allowed to call, for a server on its own port (CORS). Without it, only the dev server's own pages
   * may: cross-site requests are refused.
   */
  isAllowedOrigin?: (origin: string) => boolean
  now?: () => number
  /** Called for each location handed to the targets. */
  onOpen?: (signal: OpenSignal) => void
  onError?: (error: unknown) => void
}

type Next = (error?: unknown) => void

/**
 * Connect middleware for `<base>/__claude-open?file=<path>&line=<n>&column=<n>`.
 * 204 when at least one target took it, 500 when all failed, 400 for a file outside the workspace, 403 for a cross-site request.
 */
export const createOpenHandler = ({
  workspaceRoot,
  projectRoot,
  openers,
  isAllowedOrigin,
  now = Date.now,
  onOpen,
  onError,
}: OpenHandlerOptions) =>
  async (req: IncomingMessage, res: ServerResponse, next: Next): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.endsWith(`/${ENDPOINT}`)) {
      next()
      return
    }

    // Any page the browser has open could call a localhost URL; only the app itself may
    const origin = req.headers.origin
    if (isAllowedOrigin) {
      if (origin && !isAllowedOrigin(origin)) {
        res.statusCode = 403
        res.end(`claude-locator: ${origin} may not call this server`)
        return
      }
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Vary', 'Origin')
      }
    } else if (req.headers['sec-fetch-site'] === 'cross-site') {
      res.statusCode = 403
      res.end('claude-locator: cross-site requests are refused')
      return
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.statusCode = 405
      res.end()
      return
    }

    const file = resolveSourceFile(url.searchParams.get('file') ?? '', workspaceRoot, projectRoot)
    if (!file) {
      res.statusCode = 400
      res.end(`claude-locator: file must be an existing file inside ${workspaceRoot}`)
      return
    }

    const signal: OpenSignal = {
      file,
      line: positiveInt(url.searchParams.get('line')),
      column: positiveInt(url.searchParams.get('column')),
      at: now(),
    }
    onOpen?.(signal)
    // Each target on its own: an editor that is not installed does not keep the Claude pane from opening
    const results = await Promise.allSettled(openers.map(async (opener) => opener(signal)))
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    for (const failure of failures) {
      onError?.(failure.reason)
    }
    res.statusCode = failures.length === openers.length && openers.length > 0 ? 500 : 204
    res.end()
  }
