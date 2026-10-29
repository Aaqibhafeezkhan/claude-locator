import type { EngineInterface, Register } from 'claude-code'

// What vite-plugin-claude-locator writes, under the workspace root, on each Option+click
const SIGNAL_FILE = 'node_modules/.cache/claude-locator/open.json'
const POLL_MS = 400

type OpenSignal = { file: string; line?: number; column?: number; at: number }

const parentOf = (dir: string): string | undefined => {
  const trimmed = dir.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (cut < 0) {
    return undefined
  }
  // Keep `/` and `C:\` as roots rather than cutting them to nothing
  const parent = trimmed.slice(0, cut) || trimmed.slice(0, 1)
  return parent === trimmed || /^[A-Za-z]:$/.test(parent) ? undefined : parent
}

/** The session folder and every folder above it: the dev server may run in a package of a monorepo. */
export const candidateFiles = (dirs: string[]): string[] => {
  const files = new Set<string>()
  for (const start of dirs) {
    const separator = start.includes('\\') && !start.includes('/') ? '\\' : '/'
    for (let dir: string | undefined = start; dir; dir = parentOf(dir)) {
      files.add(`${dir.replace(/[\\/]+$/, '')}${separator}${SIGNAL_FILE.split('/').join(separator)}`)
    }
  }
  return [...files]
}

export const parseSignal = (text: string): OpenSignal | undefined => {
  try {
    const value = JSON.parse(text) as Partial<OpenSignal>
    return typeof value.file === 'string' && value.file && typeof value.at === 'number'
      ? (value as OpenSignal)
      : undefined
  } catch {
    return undefined
  }
}

/** The newest signal among the files that exist. */
const readNewest = async ($: EngineInterface, files: string[]): Promise<OpenSignal | undefined> => {
  let newest: OpenSignal | undefined
  for (const file of files) {
    const text = await $.fs.read(file).catch(() => undefined)
    const signal = text === undefined ? undefined : parseSignal(text)
    if (signal && (!newest || signal.at > newest.at)) {
      newest = signal
    }
  }
  return newest
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const files = candidateFiles([await $.session.cwd(), await $.session.root()])

    // A click from before the session started is not opened
    let lastAt = (await readNewest($, files))?.at ?? 0
    let isBusy = false

    $.clock.every(POLL_MS, async () => {
      if (isBusy) {
        return
      }
      isBusy = true
      try {
        const signal = await readNewest($, files)
        if (!signal || signal.at <= lastAt) {
          return
        }
        lastAt = signal.at
        const opened = await $.mcp.call('ccd_view', 'show_pane', {
          pane: 'file',
          path: signal.file,
          ...(signal.line ? { line: signal.line } : {}),
        })
        if (opened.isError) {
          $.ui.toast(`claude-locator: could not open ${signal.file}`)
        }
      } catch {
        $.ui.toast('claude-locator: the Files pane is not available in this session')
      } finally {
        isBusy = false
      }
    })

    return result
  })
}
