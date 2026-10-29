import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { DEFAULT_SIGNAL_FILE, createOpenHandler } from './server'
import { createOpeners, describeTargets, serverTargets, type OpenTarget, type TargetOptions } from './targets'

export const DEFAULT_STANDALONE_PORT = 5678

/** Pages served from this machine: `localhost`, `*.localhost`, `127.0.0.1`, `[::1]`, any port. */
export const isLoopbackOrigin = (origin: string): boolean => {
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

const readJson = (file: string): Record<string, unknown> | undefined => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    return undefined
  }
}

/**
 * The monorepo root above `start` (the highest folder with `pnpm-workspace.yaml` or a `package.json` with
 * `workspaces`), else the git root, else `start`: the same folder Vite would pick, so the Claude Code plugin,
 * which looks from the session folder upwards, finds the signal file.
 */
export const findWorkspaceRoot = (start: string): string => {
  let workspace: string | undefined
  let gitRoot: string | undefined
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) || readJson(path.join(dir, 'package.json'))?.workspaces) {
      workspace = dir
    }
    if (!gitRoot && fs.existsSync(path.join(dir, '.git'))) {
      gitRoot = dir
    }
    if (path.dirname(dir) === dir) {
      break
    }
  }
  return workspace ?? gitRoot ?? path.resolve(start)
}

export interface StandaloneOptions extends Partial<Omit<TargetOptions, 'workspaceRoot'>> {
  /** Where the click goes. Default: `['claude']`. `'clipboard'` is the page's job; pass it to the browser entry. */
  open?: OpenTarget | OpenTarget[]
  /** The app's own folder: relative paths from the framework (Angular) start here. Default: the current folder. */
  root?: string
  /** Files outside it are refused. Default: the monorepo or git root above `root`. */
  workspaceRoot?: string
  port?: number
  host?: string
  log?: (line: string) => void
}

/**
 * The open endpoint on a port of its own, for dev servers that take no Vite plugin (Angular CLI, webpack, Next.js).
 * Pages on this machine call it from the browser entry, `vite-plugin-claude-locator/client`.
 */
export const startStandaloneServer = (options: StandaloneOptions = {}): Promise<{ url: string; close: () => Promise<void> }> => {
  const root = path.resolve(options.root ?? process.cwd())
  const workspaceRoot = path.resolve(options.workspaceRoot ?? findWorkspaceRoot(root))
  const targets = ([] as OpenTarget[]).concat(options.open ?? 'claude')
  const log = options.log ?? ((line: string) => console.log(line))
  const names = describeTargets(serverTargets(targets))

  const handler = createOpenHandler({
    workspaceRoot,
    projectRoot: root,
    openers: createOpeners(targets, { ...options, workspaceRoot, signalFile: options.signalFile ?? DEFAULT_SIGNAL_FILE }),
    isAllowedOrigin: isLoopbackOrigin,
    onOpen: (signal) => log(`[claude-locator] ${path.relative(workspaceRoot, signal.file)}:${signal.line ?? 1} → ${names}`),
    onError: (error) => log(`[claude-locator] ${String(error)}`),
  })
  const server = http.createServer((req, res) => {
    void handler(req, res, () => {
      res.statusCode = 404
      res.end()
    })
  })

  const port = options.port ?? DEFAULT_STANDALONE_PORT
  const host = options.host ?? '127.0.0.1'
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      const address = server.address()
      const actualPort = typeof address === 'object' && address ? address.port : port
      resolve({
        url: `http://${host}:${actualPort}`,
        close: () => new Promise((done) => server.close(() => done())),
      })
    })
  })
}
