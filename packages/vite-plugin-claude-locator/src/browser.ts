/**
 * The page script for apps whose dev server takes no Vite plugin (Angular CLI, webpack, Next.js), talking to the
 * standalone server (`npx claude-locator`). Load it in development only:
 *
 *   if (isDevMode()) import('vite-plugin-claude-locator/client').then((m) => m.startClaudeLocator())
 */
import { startClaudeLocator as start, type ClientApi } from './client'

export type { ClientApi, Source, TreeItem } from './client'

export interface BrowserOptions {
  /** The standalone server. Default: `http://127.0.0.1:5678`. */
  server?: string
  /** Also copy the location on each click: `true` for `{path}:{line}`, or a template. Default: false. */
  copy?: boolean | string
  /** Only copy, with no server. Default: false. */
  copyOnly?: boolean
  /** The key held while hovering and clicking. Default: `alt` (Option on macOS). */
  modifier?: 'alt' | 'ctrl' | 'meta' | 'shift'
}

export function startClaudeLocator(options: BrowserOptions = {}): ClientApi {
  const server = (options.server ?? 'http://127.0.0.1:5678').replace(/\/$/, '')
  const copyFormat = options.copy === true || (options.copyOnly && !options.copy) ? '{path}:{line}' : options.copy || null
  return start({
    endpoint: options.copyOnly ? null : `${server}/__claude-open`,
    copyFormat,
    workspaceRoot: '',
    projectRoot: '',
    modifier: `${options.modifier ?? 'alt'}Key`,
    attribute: 'data-claude-source',
    componentProperty: '__claudeSource',
  })
}
