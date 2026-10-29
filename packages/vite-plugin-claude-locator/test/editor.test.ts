import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { editorOpener } from '../src/editor'

const signal = { file: '/repo/src/App.tsx', line: 12, column: 3, at: 1 }

describe('editorOpener', () => {
  it('hands launch-editor the file with its line and column, and the editor asked for', async () => {
    const launch = vi.fn()
    await editorOpener('cursor', launch)(signal)
    expect(launch).toHaveBeenCalledWith('/repo/src/App.tsx:12:3', 'cursor', expect.any(Function))
  })

  it('opens line 1 when the click has no line', async () => {
    const launch = vi.fn()
    await editorOpener(undefined, launch)({ file: '/repo/src/App.tsx', at: 1 })
    expect(launch).toHaveBeenCalledWith('/repo/src/App.tsx:1:1', undefined, expect.any(Function))
  })

  it('rejects when launch-editor cannot find the editor', async () => {
    const launch = vi.fn((file: string, _editor?: string, onError?: (name: string, message: string | null) => void) =>
      onError?.(file, 'not found'),
    )
    await expect(editorOpener('nope', launch)(signal)).rejects.toThrow('could not open /repo/src/App.tsx:12:3 in an editor: not found')
  })

  it('runs the real launcher with the file it was given', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-locator-editor-'))
    const record = path.join(folder, 'args.txt')
    const fakeEditor = path.join(folder, 'fake-editor')
    fs.writeFileSync(fakeEditor, `#!/bin/sh\necho "$@" > "${record}"\n`, { mode: 0o755 })
    // launch-editor skips a file that does not exist
    const source = path.join(folder, 'App.tsx')
    fs.writeFileSync(source, '')

    await editorOpener(fakeEditor)({ ...signal, file: source })
    await vi.waitFor(() => expect(fs.existsSync(record)).toBe(true))
    expect(fs.readFileSync(record, 'utf8')).toContain(source)
    fs.rmSync(folder, { recursive: true, force: true })
  })
})
