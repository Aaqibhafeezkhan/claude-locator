import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { claudeOpener, createOpenHandler, resolveSourceFile, type Opener } from '../src/server'

let workspace: string
let signalFile: string

beforeEach(() => {
  workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-locator-')))
  fs.mkdirSync(path.join(workspace, 'src'))
  fs.writeFileSync(path.join(workspace, 'src/App.tsx'), 'export {}')
  signalFile = path.join(workspace, 'node_modules/.cache/claude-locator/open.json')
})

afterEach(() => {
  fs.rmSync(workspace, { recursive: true, force: true })
})

const call = async (
  url: string,
  init: { method?: string; headers?: Record<string, string>; openers?: Opener[]; onError?: (error: unknown) => void } = {},
) => {
  const handler = createOpenHandler({
    workspaceRoot: workspace,
    openers: init.openers ?? [claudeOpener(signalFile)],
    now: () => 1234,
    onError: init.onError,
  })
  const req = { url, method: init.method ?? 'POST', headers: init.headers ?? {} } as unknown as IncomingMessage
  const res = { statusCode: 200, end: vi.fn() } as unknown as ServerResponse
  const next = vi.fn()
  await handler(req, res, next)
  return { res, next }
}

describe('resolveSourceFile', () => {
  it('accepts absolute and workspace-relative paths of existing files', () => {
    const app = path.join(workspace, 'src/App.tsx')
    expect(resolveSourceFile(app, workspace)).toBe(app)
    expect(resolveSourceFile('src/App.tsx', workspace)).toBe(app)
  })

  it('refuses paths outside the workspace, missing files and folders', () => {
    expect(resolveSourceFile('/etc/hosts', workspace)).toBeUndefined()
    expect(resolveSourceFile('../outside.tsx', workspace)).toBeUndefined()
    expect(resolveSourceFile('src/Missing.tsx', workspace)).toBeUndefined()
    expect(resolveSourceFile('src', workspace)).toBeUndefined()
    expect(resolveSourceFile('', workspace)).toBeUndefined()
  })

  it('refuses a symlink inside the workspace that points outside it', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-locator-outside-'))
    fs.writeFileSync(path.join(outside, 'secret.ts'), '')
    fs.symlinkSync(path.join(outside, 'secret.ts'), path.join(workspace, 'src/link.ts'))
    expect(resolveSourceFile('src/link.ts', workspace)).toBeUndefined()
    fs.rmSync(outside, { recursive: true, force: true })
  })
})

describe('createOpenHandler', () => {
  it('writes the signal and answers 204, under any base path', async () => {
    const { res, next } = await call('/app/__claude-open?file=src/App.tsx&line=12&column=5')
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(204)
    expect(JSON.parse(fs.readFileSync(signalFile, 'utf8'))).toEqual({
      file: path.join(workspace, 'src/App.tsx'),
      line: 12,
      column: 5,
      at: 1234,
    })
  })

  it('answers 400 for a file outside the workspace and writes nothing', async () => {
    const { res } = await call('/__claude-open?file=/etc/hosts&line=1')
    expect(res.statusCode).toBe(400)
    expect(fs.existsSync(signalFile)).toBe(false)
  })

  it('refuses cross-site requests', async () => {
    const { res } = await call('/__claude-open?file=src/App.tsx', { headers: { 'sec-fetch-site': 'cross-site' } })
    expect(res.statusCode).toBe(403)
    expect(fs.existsSync(signalFile)).toBe(false)
  })

  it('drops a line or column that is not a positive integer', async () => {
    await call('/__claude-open?file=src/App.tsx&line=abc&column=-1')
    const signal = JSON.parse(fs.readFileSync(signalFile, 'utf8'))
    expect(signal.line).toBeUndefined()
    expect(signal.column).toBeUndefined()
  })

  it('hands the location to every target, and one failing does not stop the others', async () => {
    const seen: unknown[] = []
    const onError = vi.fn()
    const { res } = await call('/__claude-open?file=src/App.tsx&line=3', {
      openers: [
        () => {
          throw new Error('no editor')
        },
        (signal) => {
          seen.push(signal)
        },
      ],
      onError,
    })
    expect(res.statusCode).toBe(204)
    expect(seen).toEqual([{ file: path.join(workspace, 'src/App.tsx'), line: 3, column: undefined, at: 1234 }])
    expect(onError).toHaveBeenCalledWith(new Error('no editor'))
  })

  it('answers 500 when every target failed', async () => {
    const { res } = await call('/__claude-open?file=src/App.tsx', {
      openers: [() => Promise.reject(new Error('nope'))],
    })
    expect(res.statusCode).toBe(500)
  })

  it('passes other requests on', async () => {
    const { next } = await call('/src/App.tsx')
    expect(next).toHaveBeenCalled()
  })
})
