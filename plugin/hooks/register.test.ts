import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import { candidateFiles } from './register'

const SIGNAL = '/repo/node_modules/.cache/claude-locator/open.json'

const world = (on: On, files: Map<string, string>) => {
  const opened: Record<string, unknown>[] = []
  const toasts: string[] = []
  on('session.cwd', () => ({ value: '/repo/apps/web' }))
  on('session.root', () => ({ value: '/repo/apps/web' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.read', (_, e) => {
    const text = files.get(e.path)
    if (text === undefined) {
      throw new Error(`ENOENT: ${e.path}`)
    }
    return { value: text }
  })
  on('mcp.call', (_, e) => {
    opened.push({ server: e.server, tool: e.tool, ...e.args })
    return { value: { content: [], isError: false } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { opened, toasts }
}

test('looks for the signal in the session folder and every folder above it', () => {
  expect(candidateFiles(['/repo/apps/web'])).toEqual([
    '/repo/apps/web/node_modules/.cache/claude-locator/open.json',
    '/repo/apps/node_modules/.cache/claude-locator/open.json',
    SIGNAL,
    '/node_modules/.cache/claude-locator/open.json',
  ])
})

test('opens a new click in the Files pane, once', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const files = new Map<string, string>()
  const { opened } = world(on, files)

  await $.session.start({ cwd: '/repo/apps/web', surface: 'desktop', isInteractive: true })
  files.set(SIGNAL, JSON.stringify({ file: '/repo/packages/ui/Button.tsx', line: 12, at: 5000 }))
  await clock.advance(400)
  await clock.advance(400)

  expect(opened).toEqual([
    { server: 'ccd_view', tool: 'show_pane', pane: 'file', path: '/repo/packages/ui/Button.tsx', line: 12 },
  ])
})

test('a click written before the session started is not opened', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const files = new Map([[SIGNAL, JSON.stringify({ file: '/repo/src/Old.tsx', line: 1, at: 900 })]])
  const { opened } = world(on, files)

  await $.session.start({ cwd: '/repo/apps/web', surface: 'desktop', isInteractive: true })
  await clock.advance(1200)

  expect(opened).toEqual([])
})

test('a broken signal file is skipped', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const files = new Map<string, string>()
  const { opened } = world(on, files)

  await $.session.start({ cwd: '/repo/apps/web', surface: 'desktop', isInteractive: true })
  files.set(SIGNAL, '{"file": "/repo/src/A.tsx", "at"')
  await clock.advance(400)

  expect(opened).toEqual([])
})
