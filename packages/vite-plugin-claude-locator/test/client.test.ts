// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startClaudeLocator, type ClientApi, type ClientOptions } from '../src/client'

const options: ClientOptions = { endpoint: '/base/__claude-open', modifier: 'altKey', attribute: 'data-claude-source' }

let api: ClientApi | undefined

afterEach(() => {
  api?.dispose()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

// The page gets the function's source text, not the module: run it that way
const startInlined = (): ClientApi => new Function(`return (${startClaudeLocator.toString()})(${JSON.stringify(options)})`)()

const attachFiber = (element: Element, fiber: object): void => {
  Object.assign(element, { '__reactFiber$abc123': fiber })
}

describe('findSource', () => {
  it('runs when inlined as source text', () => {
    api = startInlined()
    expect(typeof api.findSource).toBe('function')
  })

  it('reads React 18 _debugSource from the fiber', () => {
    api = startClaudeLocator(options)
    const button = document.createElement('button')
    attachFiber(button, { _debugSource: { fileName: '/repo/src/App.tsx', lineNumber: 7, columnNumber: 3 } })
    expect(api.findSource(button)).toEqual({ file: '/repo/src/App.tsx', line: 7, column: 3 })
  })

  it('follows _debugOwner out of node_modules to the component in your code', () => {
    api = startClaudeLocator(options)
    const button = document.createElement('button')
    const owner = { _debugSource: { fileName: '/repo/src/Page.tsx', lineNumber: 20, columnNumber: 9 } }
    attachFiber(button, {
      _debugSource: { fileName: '/repo/node_modules/ui/Button.js', lineNumber: 1 },
      _debugOwner: owner,
    })
    expect(api.findSource(button)).toEqual({ file: '/repo/src/Page.tsx', line: 20, column: 9 })
  })

  it('reads the data attribute when the fiber has no source (React 19)', () => {
    api = startClaudeLocator(options)
    document.body.innerHTML = '<section data-claude-source="src/App.tsx:4:5"><b id="inner">x</b></section>'
    const inner = document.getElementById('inner') as Element
    attachFiber(inner, { _debugStack: new Error() })
    expect(api.findSource(inner)).toEqual({ file: 'src/App.tsx', line: 4, column: 5 })
  })

  it('prefers an ancestor attribute over a fiber _debugSource, whose lines other transforms may shift', () => {
    api = startClaudeLocator(options)
    document.body.innerHTML = '<div data-claude-source="src/App.tsx:6:5"><button id="b">x</button></div>'
    const button = document.getElementById('b') as Element
    attachFiber(button, { _debugSource: { fileName: '/repo/src/App.tsx', lineNumber: 25, columnNumber: 5 } })
    expect(api.findSource(button)).toEqual({ file: 'src/App.tsx', line: 6, column: 5 })
  })

  it('finds nothing outside React', () => {
    api = startClaudeLocator(options)
    document.body.innerHTML = '<p id="plain">x</p>'
    expect(api.findSource(document.getElementById('plain') as Element)).toBeUndefined()
  })
})

describe('Option+click', () => {
  it('posts the location to the endpoint and stops the click reaching the app', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    api = startClaudeLocator(options)
    document.body.innerHTML = '<a href="/x" data-claude-source="src/App.tsx:4:5">link</a>'
    const link = document.querySelector('a') as Element
    const appClick = vi.fn()
    link.addEventListener('click', appClick)

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true, button: 0 })
    link.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(appClick).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith('/base/__claude-open?file=src%2FApp.tsx&line=4&column=5', { method: 'POST' })
  })

  it('leaves a click without the modifier alone', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    api = startClaudeLocator(options)
    document.body.innerHTML = '<button data-claude-source="src/App.tsx:4:5">b</button>'
    const appClick = vi.fn()
    const button = document.querySelector('button') as Element
    button.addEventListener('click', appClick)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(appClick).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a second start replaces the first instead of doubling listeners', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    startClaudeLocator(options)
    api = startClaudeLocator(options)
    document.body.innerHTML = '<i data-claude-source="src/App.tsx:1:1">i</i>'
    ;(document.querySelector('i') as Element).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
