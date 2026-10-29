import launchEditor from 'launch-editor'
import type { Opener } from './server'

/**
 * Opens the location in a code editor through its command-line launcher (`cursor`, `code`, `windsurf`, `zed`,
 * `webstorm`, ...), the way Vite's own `/__open-in-editor` does. With no editor named, `launch-editor` uses
 * `LAUNCH_EDITOR` / `EDITOR`, then guesses from the running processes.
 */
export const editorOpener =
  (editor?: string, launch: typeof launchEditor = launchEditor): Opener =>
  (signal) =>
    new Promise<void>((resolve, reject) => {
      const position = `${signal.file}:${signal.line ?? 1}:${signal.column ?? 1}`
      let failed = false
      launch(position, editor, (fileName, message) => {
        failed = true
        reject(new Error(`could not open ${fileName} in an editor${message ? `: ${message}` : ''}`))
      })
      // launch-editor spawns and returns. A launcher it cannot find is reported through the callback before that;
      // one that fails after spawning is reported later, when this promise has settled, and launch-editor logs it
      if (!failed) {
        resolve()
      }
    })
