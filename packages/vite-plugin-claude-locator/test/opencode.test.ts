import { describe, expect, it, vi } from 'vitest'
import { formatLocation, opencodeOpener } from '../src/opencode'

const signal = { file: '/repo/src/Counter.tsx', line: 6, column: 5, at: 1 }

describe('formatLocation', () => {
  it('fills path, absolutePath, line and column', () => {
    expect(formatLocation('{path}:{line}', signal, '/repo')).toBe('src/Counter.tsx:6')
    expect(formatLocation('@{absolutePath}#L{line}C{column}', signal, '/repo')).toBe('@/repo/src/Counter.tsx#L6C5')
    expect(formatLocation('{path}:{line}', { file: '/repo/a.tsx', at: 1 }, '/repo')).toBe('a.tsx:1')
  })
})

describe('opencodeOpener', () => {
  it('appends the location to the TUI prompt through the OpenCode server', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    await opencodeOpener({ workspaceRoot: '/repo', url: 'http://127.0.0.1:4096/', fetch: fetchMock })(signal)
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:4096/tui/append-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'src/Counter.tsx:6 ' }),
      signal: expect.any(AbortSignal),
    })
  })

  it('says how to start OpenCode when nothing listens', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    await expect(opencodeOpener({ workspaceRoot: '/repo', fetch: fetchMock })(signal)).rejects.toThrow(
      'no OpenCode server at http://127.0.0.1:4096: start the TUI with `opencode --port 4096`',
    )
  })

  it('reports an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    await expect(opencodeOpener({ workspaceRoot: '/repo', fetch: fetchMock })(signal)).rejects.toThrow('answered 401')
  })
})
