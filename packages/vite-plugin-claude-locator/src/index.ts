import path from 'node:path'
import { searchForWorkspaceRoot, type HtmlTagDescriptor, type Plugin } from 'vite'
import { startClaudeLocator, type ClientOptions } from './client'
import { patchReactDevtoolsHook } from './devtools-hook'
import { createOpenHandler, DEFAULT_SIGNAL_FILE, ENDPOINT } from './server'
import { addSourceAttributes, shouldTransform, SOURCE_ATTRIBUTE } from './transform'

export type { OpenSignal } from './server'
export { DEFAULT_SIGNAL_FILE, ENDPOINT, SOURCE_ATTRIBUTE }

export interface ClaudeLocatorOptions {
  /**
   * Files outside this folder are refused, and the signal file is written under it.
   * Default: Vite's workspace root (the monorepo root when there is one, else the project root).
   * Keep it the folder your Claude Code session runs in, or one of its parents' children.
   */
  workspaceRoot?: string
  /** Where the signal file goes, relative to `workspaceRoot`. Default: `node_modules/.cache/claude-locator/open.json`. */
  signalFile?: string
  /**
   * Add `data-claude-source` to host JSX elements at transform time. React 19 needs it (it has no `_debugSource`);
   * React 18 falls back to `_debugSource` without it, whose lines @vitejs/plugin-react 4 shifts. Default: true.
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

/** Option+click an element in the dev server to open its source in the Claude desktop app's Files pane. */
export default function claudeLocator(options: ClaudeLocatorOptions = {}): Plugin {
  const {
    jsxSource = true,
    exclude = [],
    modifier = 'alt',
    patchDevtoolsHook = false,
    signalFile = DEFAULT_SIGNAL_FILE,
  } = options
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
      server.middlewares.use(
        createOpenHandler({ workspaceRoot, signalFile: path.resolve(workspaceRoot, signalFile) }),
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
