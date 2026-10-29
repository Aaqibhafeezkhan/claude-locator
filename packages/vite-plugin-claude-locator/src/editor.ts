import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import launchEditor from 'launch-editor'
import type { Opener } from './server'

// The launcher inside each app bundle. On macOS the same name on PATH may be something else:
// Cursor's agent CLI installs a `cursor` shim that refuses to open files unless the IDE's own launcher is on PATH too
const MAC_APP_LAUNCHERS: Record<string, string> = {
  cursor: '/Applications/Cursor.app/Contents/Resources/app/bin/cursor',
  code: '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
  windsurf: '/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf',
}

// Editors built on VS Code take `<folder> -g <file>:<line>:<column>`
const VSCODE_FAMILY = new Set(['code', 'code-insiders', 'codium', 'cursor', 'windsurf', 'trae', 'antigravity', 'vscodium'])

/** The launcher to run for an editor name: the app bundle's own on macOS when the app is installed, the name as given otherwise. */
export const resolveLauncher = (
  editor: string | undefined,
  platform: NodeJS.Platform = process.platform,
  exists: (file: string) => boolean = fs.existsSync,
): string | undefined => {
  const bundled = editor && platform === 'darwin' ? MAC_APP_LAUNCHERS[editor] : undefined
  return bundled && exists(bundled) ? bundled : editor
}

export const isVscodeFamily = (launcher: string): boolean =>
  VSCODE_FAMILY.has(path.basename(launcher).replace(/\.(exe|cmd)$/i, '').toLowerCase())

type Spawn = (command: string, args: string[]) => { on: (event: 'error', listener: (error: Error) => void) => void }

const spawnDetached: Spawn = (command, args) => {
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.unref()
  return child
}

/** Which window of a VS Code-family editor gets the file. */
export type EditorWindow = 'reuse' | 'project'

export interface EditorOpenerOptions {
  /** The workspace folder, for `window: 'project'`. */
  workspaceRoot: string
  /**
   * `'reuse'` (default): the window you used last, `-r -g <file>`; in an agent's built-in browser that is the window
   * you are clicking in. `'project'`: the window that has the workspace open, `<workspace> -g <file>`, opening one
   * if there is none.
   */
  window?: EditorWindow
  launch?: typeof launchEditor
  spawn?: Spawn
}

/**
 * Opens the location in a code editor through its command-line launcher.
 *
 * VS Code-family editors (Cursor, VS Code, Windsurf, ...) are run directly, detached, with `-r -g` or the workspace
 * folder (see `window`). The launcher hands the file to the running app, which takes a second or so to show it.
 * Every other editor goes through `launch-editor`, the way Vite's own `/__open-in-editor` does. With no editor named,
 * `launch-editor` uses `LAUNCH_EDITOR` / `EDITOR`, then guesses from the running processes.
 */
export const editorOpener = (editor: string | undefined, options: EditorOpenerOptions): Opener => {
  const { workspaceRoot, window = 'reuse', launch = launchEditor, spawn: run = spawnDetached } = options
  const launcher = resolveLauncher(editor)
  return (signal) =>
    new Promise<void>((resolve, reject) => {
      const position = `${signal.file}:${signal.line ?? 1}:${signal.column ?? 1}`
      if (launcher && isVscodeFamily(launcher)) {
        // Spawn errors (a launcher that is not there) arrive after this resolves; report them to the log
        const args = window === 'project' ? [workspaceRoot, '-g', position] : ['-r', '-g', position]
        run(launcher, args).on('error', (error) =>
          console.warn(`[claude-locator] could not run ${launcher}: ${error.message}`),
        )
        resolve()
        return
      }
      let failed = false
      // launch-editor splits the editor setting like a shell would: quote a path with spaces
      launch(position, launcher && /\s/.test(launcher) ? JSON.stringify(launcher) : launcher, (fileName, message) => {
        failed = true
        reject(new Error(`could not open ${fileName} in an editor${message ? `: ${message}` : ''}`))
      })
      // launch-editor spawns and returns. A launcher it cannot find is reported through the callback before that;
      // one that fails after spawning is reported later, when this promise has settled, and launch-editor logs it
      if (!failed) {
        resolve()
      }
    })
}
