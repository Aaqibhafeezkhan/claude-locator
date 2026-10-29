// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startClaudeLocator } from '../src/browser'

afterEach(() => {
  ;(window as unknown as { __claudeLocator?: { dispose: () => void } }).__claudeLocator?.dispose()
  vi.unstubAllGlobals()
})

describe('browser entry', () => {
  it('talks to the standalone server by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const api = startClaudeLocator()
    await api.open({ file: 'src/app/counter.ts', line: 7 })
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:5678/__claude-open?file=src%2Fapp%2Fcounter.ts&line=7', {
      method: 'POST',
    })
  })

  it('can only copy, with no server', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const api = startClaudeLocator({ copyOnly: true })
    expect(await api.open({ file: 'src/app/counter.ts', line: 7 })).toBe(true)
    expect(writeText).toHaveBeenCalledWith('src/app/counter.ts:7')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
