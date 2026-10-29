// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { patchReactDevtoolsHook } from '../src/devtools-hook'

type Hook = { renderers: Map<number, unknown>; inject: (renderer: unknown) => number }
const target = window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: Hook }

afterEach(() => {
  delete target.__REACT_DEVTOOLS_GLOBAL_HOOK__
})

describe('patchReactDevtoolsHook', () => {
  it('creates a hook that keeps renderers when there is none', () => {
    patchReactDevtoolsHook()
    const renderer = { version: '19' }
    const id = target.__REACT_DEVTOOLS_GLOBAL_HOOK__!.inject(renderer)
    expect(target.__REACT_DEVTOOLS_GLOBAL_HOOK__!.renderers.get(id)).toBe(renderer)
  })

  it('fixes the React Refresh stub, whose inject keeps nothing', () => {
    let nextId = 0
    target.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { renderers: new Map(), inject: () => nextId++ }
    patchReactDevtoolsHook()
    const renderer = {}
    const id = target.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject(renderer)
    expect(target.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.get(id)).toBe(renderer)
  })

  it('leaves what the DevTools extension stored, and patches once', () => {
    const stored = { fromExtension: true }
    const hook: Hook = {
      renderers: new Map(),
      inject(renderer) {
        this.renderers.set(1, stored)
        return renderer ? 1 : 0
      },
    }
    target.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook
    patchReactDevtoolsHook()
    const patched = hook.inject
    patchReactDevtoolsHook()
    expect(hook.inject).toBe(patched)
    hook.inject({})
    expect(hook.renderers.get(1)).toBe(stored)
  })

  it('runs when inlined as source text', () => {
    new Function(`(${patchReactDevtoolsHook.toString()})()`)()
    expect(target.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers).toBeInstanceOf(Map)
  })
})
