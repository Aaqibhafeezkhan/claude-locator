import path from 'node:path'
import { editorOpener, type EditorWindow } from './editor'
import { opencodeOpener } from './opencode'
import { claudeOpener, type Opener, type OpenSignal } from './server'

/**
 * Where a click sends the source:
 * - `'claude'`: the Claude desktop app's Files pane, through the claude-locator Claude Code plugin;
 * - `'editor'`: a code editor through its command-line launcher (Cursor, VS Code, Windsurf, Zed, WebStorm, ...);
 * - `'clipboard'`: the clipboard, as `locationFormat`, to paste into any agent's prompt (Codex, OpenCode, ...);
 * - `'opencode'`: the prompt of a running OpenCode TUI, as `locationFormat`;
 * - a function: called on the server with the location, for any other tool.
 */
export type OpenTarget = 'claude' | 'editor' | 'clipboard' | 'opencode' | ((location: OpenSignal) => void | Promise<void>)

export interface TargetOptions {
  workspaceRoot: string
  /** The signal file of the `'claude'` target, relative to the workspace root. */
  signalFile: string
  editor?: string
  editorWindow?: EditorWindow
  locationFormat?: string
  opencodeUrl?: string
}

/** The targets that run on the server: all but the clipboard, which the page writes in the click. */
export const serverTargets = (targets: OpenTarget[]): OpenTarget[] => targets.filter((target) => target !== 'clipboard')

export const describeTargets = (targets: OpenTarget[]): string =>
  targets.map((target) => (typeof target === 'string' ? target : 'function')).join(', ')

export const createOpeners = (targets: OpenTarget[], options: TargetOptions): Opener[] =>
  serverTargets(targets).map((target) => {
    switch (target) {
      case 'claude':
        return claudeOpener(path.resolve(options.workspaceRoot, options.signalFile))
      case 'editor':
        return editorOpener(options.editor, { workspaceRoot: options.workspaceRoot, window: options.editorWindow })
      case 'opencode':
        return opencodeOpener({
          workspaceRoot: options.workspaceRoot,
          url: options.opencodeUrl,
          format: options.locationFormat,
        })
      default:
        return target as Opener
    }
  })
