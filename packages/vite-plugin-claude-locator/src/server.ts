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

/**
 * Resolves the `file` the client sent (absolute, or relative to the workspace root)
 * to an absolute path of an existing file inside the workspace, or `undefined`.
 */
export const resolveSourceFile = (file: string, workspaceRoot: string): string | undefined => {
  if (!file || file.includes('\0')) {
    return undefined
  }
  const root = realPathOrSelf(path.resolve(workspaceRoot))
  const target = realPathOrSelf(path.resolve(root, file))
  if (!isInside(target, root)) {
    return undefined
  }
  try {
    return fs.statSync(target).isFile() ? target : undefined
  } catch {
    return undefined
  }
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

export interface OpenHandlerOptions {
  workspaceRoot: string
  signalFile: string
  now?: () => number
}

type Next = (error?: unknown) => void

/**
 * Connect middleware for `<base>/__claude-open?file=<path>&line=<n>&column=<n>`.
 * 204 when the signal was written, 400 for a file outside the workspace, 403 for a cross-site request.
 */
export const createOpenHandler = ({ workspaceRoot, signalFile, now = Date.now }: OpenHandlerOptions) =>
  (req: IncomingMessage, res: ServerResponse, next: Next): void => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.endsWith(`/${ENDPOINT}`)) {
      next()
      return
    }

    // Any page the browser has open could call a localhost URL; only the app itself may
    if (req.headers['sec-fetch-site'] === 'cross-site') {
      res.statusCode = 403
      res.end('claude-locator: cross-site requests are refused')
      return
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.statusCode = 405
      res.end()
      return
    }

    const file = resolveSourceFile(url.searchParams.get('file') ?? '', workspaceRoot)
    if (!file) {
      res.statusCode = 400
      res.end(`claude-locator: file must be an existing file inside ${workspaceRoot}`)
      return
    }

    writeSignal(signalFile, {
      file,
      line: positiveInt(url.searchParams.get('line')),
      column: positiveInt(url.searchParams.get('column')),
      at: now(),
    })
    res.statusCode = 204
    res.end()
  }
