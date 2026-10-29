import path from 'node:path'
import type { Opener, OpenSignal } from './server'

/** Where `opencode --port 4096` listens. The OpenCode TUI picks a random port unless given one. */
export const DEFAULT_OPENCODE_URL = 'http://127.0.0.1:4096'

/** How a location is written for an agent's prompt or the clipboard. */
export const DEFAULT_LOCATION_FORMAT = '{path}:{line}'

/**
 * Fills `{path}` (relative to the workspace), `{absolutePath}`, `{line}` and `{column}` in a template.
 * The client has its own copy of this in client.ts, which cannot import.
 */
export const formatLocation = (template: string, signal: OpenSignal, workspaceRoot: string): string => {
  const relative = path.relative(workspaceRoot, signal.file).split(path.sep).join('/')
  return template
    .split('{path}').join(relative)
    .split('{absolutePath}').join(signal.file)
    .split('{line}').join(String(signal.line ?? 1))
    .split('{column}').join(String(signal.column ?? 1))
}

export interface OpencodeOpenerOptions {
  workspaceRoot: string
  url?: string
  format?: string
  fetch?: typeof fetch
}

/**
 * Appends the location to the prompt of a running OpenCode TUI, through its server's `POST /tui/append-prompt`,
 * so you can ask the agent about the component next. The TUI must listen on a known port: `opencode --port 4096`.
 */
export const opencodeOpener = ({
  workspaceRoot,
  url = DEFAULT_OPENCODE_URL,
  format = DEFAULT_LOCATION_FORMAT,
  fetch: request = fetch,
}: OpencodeOpenerOptions): Opener =>
  async (signal) => {
    const endpoint = `${url.replace(/\/$/, '')}/tui/append-prompt`
    let response: Response
    try {
      response = await request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // A trailing space, so the next thing typed or appended starts a new word
        body: JSON.stringify({ text: `${formatLocation(format, signal, workspaceRoot)} ` }),
        signal: AbortSignal.timeout(2000),
      })
    } catch (error) {
      throw new Error(`no OpenCode server at ${url}: start the TUI with \`opencode --port ${new URL(url).port || 4096}\` (${String(error)})`)
    }
    if (!response.ok) {
      throw new Error(`OpenCode at ${url} answered ${response.status} to append-prompt`)
    }
  }
