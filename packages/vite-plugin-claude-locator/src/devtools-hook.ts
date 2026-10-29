/**
 * Runs in the page before React. Inlined into index.html with Function#toString, so it must stay self-contained.
 *
 * Tools such as LocatorJS find components through `__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers`.
 * The React DevTools extension fills that map; without the extension (the Claude desktop app's built-in browser,
 * a fresh Chrome profile) the only hook is the stub React Refresh creates, whose `inject` hands out an id but
 * keeps nothing, so `renderers` stays empty. This makes `inject` keep each renderer, creating a minimal hook
 * when there is none. claude-locator itself reads fibers straight from the DOM and does not need it.
 */
export function patchReactDevtoolsHook(): void {
  type Hook = {
    renderers: Map<number, unknown>
    supportsFiber: boolean
    inject: (renderer: unknown) => number
    onCommitFiberRoot?: () => void
    onCommitFiberUnmount?: () => void
    __claudeLocatorPatched?: boolean
  }

  const target = window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: Hook }
  if (!target.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    let nextId = 0
    target.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map(),
      supportsFiber: true,
      inject: () => {
        nextId += 1
        return nextId
      },
      onCommitFiberRoot: () => undefined,
      onCommitFiberUnmount: () => undefined,
    }
  }

  const hook = target.__REACT_DEVTOOLS_GLOBAL_HOOK__
  if (hook.__claudeLocatorPatched) {
    return
  }
  hook.__claudeLocatorPatched = true
  if (!(hook.renderers instanceof Map)) {
    hook.renderers = new Map()
  }
  const originalInject = hook.inject
  hook.inject = function injectAndKeepRenderer(this: Hook, renderer: unknown): number {
    const id = originalInject.call(this, renderer)
    // The extension's hook already keeps it; fill the map only where it did not
    if (!hook.renderers.has(id)) {
      hook.renderers.set(id, renderer)
    }
    return id
  }
}
