import path from 'node:path'
import { searchForWorkspaceRoot, type HtmlTagDescriptor, type Plugin } from 'vite'
import { startClaudeLocator, type ClientOptions } from './client'
import { patchReactDevtoolsHook } from './devtools-hook'
import { editorOpener } from './editor'
import { claudeOpener, createOpenHandler, DEFAULT_SIGNAL_FILE, ENDPOINT, type Opener, type OpenSignal } from './server'
import { addSourceAttributes, COMPONENT_SOURCE_PROPERTY, shouldTransform, SOURCE_ATTRIBUTE } from './transform'

export type { OpenSignal }
export { COMPONENT_SOURCE_PROPERTY, DEFAULT_SIGNAL_FILE, ENDPOINT, SOURCE_ATTRIBUTE }

/**
 * Where a click opens the source:
 * - `'claude'`: the Claude desktop app's Files pane, through the claude-locator Claude Code plugin;
 * - `'editor'`: a code editor through its command-line launcher (Cursor, VS Code, Windsurf, Zed, WebStorm, ...);
 * - a function: called with the location, for any other tool.
 */
export type OpenTarget = 'claude' | 'editor' | ((location: OpenSignal) => void | Promise<void>)

export interface ClaudeLocatorOptions {
  /** Where a click opens. Default: `['claude']`. */
  open?: OpenTarget | OpenTarget[]
  /**
   * The editor launcher for the `'editor'` target: `cursor`, `code`, `windsurf`, `zed`, `webstorm`, ...
   * Default: `LAUNCH_EDITOR`, then `EDITOR`, then the editor that is running.
   */
  editor?: string
  /**
   * Files outside this folder are refused, and the signal file is written under it.
   * Default: Vite's workspace root (the monorepo root when there is one, else the project root).
   * Keep it the folder your Claude Code session runs in, or one below it.
   */
  workspaceRoot?: string
  /** Where the signal file goes, relative to `workspaceRoot`. Default: `node_modules/.cache/claude-locator/open.json`. */
  signalFile?: string
  /**
   * Tag host JSX elements with `data-claude-source` and components with where they are defined, at transform
   * time. React 19 needs it (it has no `_debugSource`); React 18 falls back to `_debugSource` without it, whose
   * lines @vitejs/plugin-react 4 shifts. Default: true.
   */
  jsxSource?: boolean
  /** Files the JSX transform skips, matched against the module id. */
  exclude?: (RegExp | string)[]
  /** The key held while hovering and clicking. Default: `alt` (Option on macOS). */
  modifier?: 'alt' | 'ctrl' | 'meta' | 'shift'
  /**
   * Make `__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers` work without the React DevTools extension, for other tools
   * (LocatorJS) that rely on it. claude-locator does not need it. Default: false.
   */
  patchDevtoolsHook?: boolean
}

const inlineCall = (fn: (...args: never[]) => unknown, ...args: unknown[]): string =>
  `(${fn.toString()})(${args.map((arg) => JSON.stringify(arg)).join(',')});`

const isExcluded = (id: string, exclude: (RegExp | string)[]): boolean =>
  exclude.some((pattern) => (typeof pattern === 'string' ? id.includes(pattern) : pattern.test(id)))

/** Option+click an element in the dev server to open its source in the Claude desktop app or your editor. */
export default function claudeLocator(options: ClaudeLocatorOptions = {}): Plugin {
  const {
    jsxSource = true,
    exclude = [],
    modifier = 'alt',
    patchDevtoolsHook = false,
    signalFile = DEFAULT_SIGNAL_FILE,
  } = options
  const targets = ([] as OpenTarget[]).concat(options.open ?? 'claude')
  let workspaceRoot = ''
  let base = '/'

  return {
    name: 'claude-locator',
    apply: 'serve',
    enforce: 'pre',

    configResolved(config) {
      workspaceRoot = path.resolve(options.workspaceRoot ?? searchForWorkspaceRoot(config.root))
      // A full-URL base (a CDN) does not serve the dev endpoint; fall back to the origin
      base = config.base.startsWith('/') ? config.base : '/'
    },

    configureServer(server) {
      const openers: Opener[] = targets.map((target) =>
        target === 'claude'
          ? claudeOpener(path.resolve(workspaceRoot, signalFile))
          : target === 'editor'
            ? editorOpener(options.editor)
            : target,
      )
      server.middlewares.use(
        createOpenHandler({
          workspaceRoot,
          openers,
          onError: (error) => server.config.logger.warn(`[claude-locator] ${String(error)}`, { timestamp: true }),
        }),
      )
    },

    transform: {
      // Ahead of @vitejs/plugin-react's own `enforce: 'pre'` transform, which prepends
      // React Refresh code and would shift every line number
      order: 'pre',
      handler(code, id) {
        if (!jsxSource || !shouldTransform(id) || isExcluded(id, exclude)) {
          return null
        }
        return addSourceAttributes(code, id, workspaceRoot)
      },
    },

    transformIndexHtml() {
      const clientOptions: ClientOptions = {
        endpoint: `${base.replace(/\/?$/, '/')}${ENDPOINT}`,
        modifier: `${modifier}Key`,
        attribute: SOURCE_ATTRIBUTE,
        componentProperty: COMPONENT_SOURCE_PROPERTY,
      }
      const tags: HtmlTagDescriptor[] = [
        { tag: 'script', children: inlineCall(startClaudeLocator, clientOptions), injectTo: 'body' },
      ]
      if (patchDevtoolsHook) {
        // Before every module script, so before react-dom registers its renderer
        tags.unshift({ tag: 'script', children: inlineCall(patchReactDevtoolsHook), injectTo: 'head-prepend' })
      }
      return tags
    },
  }
}

export { claudeLocator }
