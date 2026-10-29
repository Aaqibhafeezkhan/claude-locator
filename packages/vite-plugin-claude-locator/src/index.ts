import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { searchForWorkspaceRoot, type HtmlTagDescriptor, type Plugin } from 'vite'
import { startClaudeLocator, type ClientOptions } from './client'
import { patchReactDevtoolsHook } from './devtools-hook'
import type { EditorWindow } from './editor'
import { DEFAULT_LOCATION_FORMAT, DEFAULT_OPENCODE_URL } from './opencode'
import { createOpenHandler, DEFAULT_SIGNAL_FILE, ENDPOINT, type OpenSignal } from './server'
import { createOpeners, describeTargets, serverTargets, type OpenTarget } from './targets'
import { addAstroSourceAttributes, addVueSourceAttributes, type AstroCompiler, type VueCompiler } from './templates'
import { addSourceAttributes, COMPONENT_SOURCE_PROPERTY, shouldTransform, SOURCE_ATTRIBUTE } from './transform'

export type { OpenSignal }
export { COMPONENT_SOURCE_PROPERTY, DEFAULT_LOCATION_FORMAT, DEFAULT_OPENCODE_URL, DEFAULT_SIGNAL_FILE, ENDPOINT, SOURCE_ATTRIBUTE }

export type { OpenTarget }

export interface ClaudeLocatorOptions {
  /** Where a click opens. Default: `['claude']`. */
  open?: OpenTarget | OpenTarget[]
  /**
   * The editor launcher for the `'editor'` target: `cursor`, `code`, `windsurf`, `zed`, `webstorm`, ...
   * Default: `LAUNCH_EDITOR`, then `EDITOR`, then the editor that is running.
   */
  editor?: string
  /**
   * Which window of a VS Code-family editor (Cursor, VS Code, Windsurf, ...) gets the file:
   * `'reuse'`, the one you used last, which is the one you are clicking in when its built-in browser shows the app;
   * `'project'`, the one that has the workspace open, opening it if needed. Default: `'reuse'`.
   */
  editorWindow?: EditorWindow
  /**
   * How `'clipboard'` and `'opencode'` write the location: `{path}` (relative to the workspace), `{absolutePath}`,
   * `{line}`, `{column}`. Default: `'{path}:{line}'`.
   */
  locationFormat?: string
  /** The OpenCode server of the `'opencode'` target. Default: `http://127.0.0.1:4096`, as `opencode --port 4096` serves. */
  opencodeUrl?: string
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
  /**
   * Add the page script to `index.html`. Turn it off where the framework renders its own HTML (Astro, SSR) and
   * import `virtual:claude-locator/client` from a page script instead; the Astro integration does that. Default: true.
   */
  injectClient?: boolean
}

/** Import this from a page script where there is no `index.html` to inject into. */
export const CLIENT_MODULE_ID = 'virtual:claude-locator/client'
const RESOLVED_CLIENT_MODULE_ID = `\0${CLIENT_MODULE_ID}`

const inlineCall = (fn: (...args: never[]) => unknown, ...args: unknown[]): string =>
  `(${fn.toString()})(${args.map((arg) => JSON.stringify(arg)).join(',')});`

// The project's own copy, so it matches the Vue version that compiles the app
const loadVueCompiler = (projectRoot: string): VueCompiler | undefined => {
  const require = createRequire(path.join(projectRoot, 'package.json'))
  for (const name of ['vue/compiler-sfc', '@vue/compiler-sfc']) {
    try {
      return require(name) as VueCompiler
    } catch {
      // not installed under this name
    }
  }
  return undefined
}

// Astro's own compiler, from the copy of astro the project installed
const loadAstroCompiler = async (projectRoot: string): Promise<AstroCompiler | undefined> => {
  try {
    const astroPackage = fs.realpathSync(createRequire(path.join(projectRoot, 'package.json')).resolve('astro/package.json'))
    const require = createRequire(astroPackage)
    for (const name of ['@astrojs/compiler-rs', '@astrojs/compiler']) {
      try {
        return (await import(pathToFileURL(require.resolve(name)).href)) as AstroCompiler
      } catch {
        // this Astro uses the other one
      }
    }
  } catch {
    // no astro here
  }
  return undefined
}

const isExcluded = (id: string, exclude: (RegExp | string)[]): boolean =>
  exclude.some((pattern) => (typeof pattern === 'string' ? id.includes(pattern) : pattern.test(id)))

/** Option+click an element in the dev server to open its source in the Claude desktop app or your editor. */
export default function claudeLocator(options: ClaudeLocatorOptions = {}): Plugin {
  const {
    jsxSource = true,
    exclude = [],
    modifier = 'alt',
    patchDevtoolsHook = false,
    injectClient = true,
    signalFile = DEFAULT_SIGNAL_FILE,
  } = options
  const targets = ([] as OpenTarget[]).concat(options.open ?? 'claude')
  let workspaceRoot = ''
  let projectRoot = ''
  let base = '/'
  let vueCompiler: VueCompiler | null | undefined
  let astroCompiler: Promise<AstroCompiler | undefined> | undefined

  const clientCode = (): string => {
    const hasServerTarget = serverTargets(targets).length > 0
    const clientOptions: ClientOptions = {
      endpoint: hasServerTarget ? `${base.replace(/\/?$/, '/')}${ENDPOINT}` : null,
      copyFormat: targets.includes('clipboard') ? (options.locationFormat ?? DEFAULT_LOCATION_FORMAT) : null,
      workspaceRoot,
      projectRoot,
      modifier: `${modifier}Key`,
      attribute: SOURCE_ATTRIBUTE,
      componentProperty: COMPONENT_SOURCE_PROPERTY,
    }
    return inlineCall(startClaudeLocator, clientOptions)
  }

  return {
    name: 'claude-locator',
    apply: 'serve',
    enforce: 'pre',

    configResolved(config) {
      projectRoot = config.root
      workspaceRoot = path.resolve(options.workspaceRoot ?? searchForWorkspaceRoot(config.root))
      // A full-URL base (a CDN) does not serve the dev endpoint; fall back to the origin
      base = config.base.startsWith('/') ? config.base : '/'
    },

    configureServer(server) {
      // The clipboard is written in the page, which holds the click's permission to; the rest run here
      const openers = createOpeners(targets, { ...options, workspaceRoot, signalFile })
      const targetNames = describeTargets(serverTargets(targets))
      const { logger } = server.config
      server.middlewares.use(
        createOpenHandler({
          workspaceRoot,
          projectRoot,
          openers,
          onOpen: (signal) =>
            logger.info(
              `[claude-locator] ${path.relative(workspaceRoot, signal.file)}:${signal.line ?? 1} → ${targetNames}`,
              { timestamp: true },
            ),
          onError: (error) => logger.warn(`[claude-locator] ${String(error)}`, { timestamp: true }),
        }),
      )
    },

    transform: {
      // Ahead of @vitejs/plugin-react's own `enforce: 'pre'` transform, which prepends
      // React Refresh code and would shift every line number
      order: 'pre',
      async handler(code, id) {
        if (!jsxSource || isExcluded(id, exclude)) {
          return null
        }
        if (/\.astro$/.test(id) && !id.includes('/node_modules/')) {
          astroCompiler ??= loadAstroCompiler(projectRoot)
          const compiler = await astroCompiler
          return compiler ? addAstroSourceAttributes(code, id, workspaceRoot, compiler) : null
        }
        // The SFC itself; its compiled parts come back as `App.vue?vue&type=...` and are left alone
        if (/\.vue$/.test(id) && !id.includes('/node_modules/')) {
          if (vueCompiler === undefined) {
            vueCompiler = loadVueCompiler(projectRoot) ?? null
          }
          return vueCompiler ? addVueSourceAttributes(code, id, workspaceRoot, vueCompiler) : null
        }
        return shouldTransform(id) ? addSourceAttributes(code, id, workspaceRoot) : null
      },
    },

    resolveId(id) {
      return id === CLIENT_MODULE_ID ? RESOLVED_CLIENT_MODULE_ID : null
    },

    load(id) {
      return id === RESOLVED_CLIENT_MODULE_ID ? clientCode() : null
    },

    transformIndexHtml() {
      const tags: HtmlTagDescriptor[] = injectClient ? [{ tag: 'script', children: clientCode(), injectTo: 'body' }] : []
      if (patchDevtoolsHook) {
        // Before every module script, so before react-dom registers its renderer
        tags.unshift({ tag: 'script', children: inlineCall(patchReactDevtoolsHook), injectTo: 'head-prepend' })
      }
      return tags
    },
  }
}

export { claudeLocator }
