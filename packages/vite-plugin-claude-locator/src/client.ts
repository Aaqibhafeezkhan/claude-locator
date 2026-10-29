/**
 * Runs in the page. Inlined into index.html with Function#toString, so it must stay self-contained:
 * no imports, no references to anything outside its own body.
 */

export interface ClientOptions {
  /** URL of the dev-server endpoint, e.g. `/__claude-open`. */
  endpoint: string
  /** The modifier held while hovering and clicking. */
  modifier: 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'
  /** The attribute the JSX transform adds, e.g. `data-claude-source`. */
  attribute: string
}

export interface Source {
  file: string
  line?: number
  column?: number
}

export interface ClientApi {
  /** The source location the plugin would open for this element, if any. */
  findSource: (element: Element) => Source | undefined
  /** Sends a location to the dev server; resolves to whether it accepted it. */
  open: (source: Source) => Promise<boolean>
  /** Removes listeners and the overlay. */
  dispose: () => void
}

export function startClaudeLocator(options: ClientOptions): ClientApi {
  type Fiber = {
    _debugSource?: { fileName?: string; lineNumber?: number; columnNumber?: number } | null
    _debugOwner?: Fiber | null
    return?: Fiber | null
  }

  const globalWindow = window as unknown as { __claudeLocator?: ClientApi }
  if (globalWindow.__claudeLocator) {
    globalWindow.__claudeLocator.dispose()
  }

  const isProjectFile = (file: string): boolean => !/[\\/]node_modules[\\/]/.test(file)

  // React 18 and older, without the attribute: each fiber knows where its JSX element was written.
  // Walking `_debugOwner` from a library's element reaches the component in your code that rendered it.
  const sourceFromFiber = (element: Element): Source | undefined => {
    const key = Object.keys(element).find(
      (name) => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'),
    )
    let fiber = key ? ((element as unknown as Record<string, Fiber | undefined>)[key] ?? null) : null
    for (let depth = 0; fiber && depth < 200; depth += 1) {
      const debugSource = fiber._debugSource
      if (debugSource && debugSource.fileName && isProjectFile(debugSource.fileName)) {
        return { file: debugSource.fileName, line: debugSource.lineNumber, column: debugSource.columnNumber }
      }
      fiber = fiber._debugOwner || null
    }
    return undefined
  }

  // The attribute the JSX transform added: React 19 has no `_debugSource`
  const sourceFromAttribute = (element: Element): Source | undefined => {
    const value = element.getAttribute(options.attribute)
    if (!value) {
      return undefined
    }
    const match = /^(.*):(\d+):(\d+)$/.exec(value)
    return match ? { file: match[1], line: Number(match[2]), column: Number(match[3]) } : { file: value }
  }

  // The attribute comes first: it is taken from the file as written, while `_debugSource` is computed after
  // other transforms ran (@vitejs/plugin-react 4 prepends React Refresh code, shifting its lines)
  const findSource = (start: Element): Source | undefined => {
    for (let element: Element | null = start; element; element = element.parentElement) {
      const source = sourceFromAttribute(element)
      if (source) {
        return source
      }
    }
    for (let element: Element | null = start; element; element = element.parentElement) {
      const source = sourceFromFiber(element)
      if (source) {
        return source
      }
    }
    return undefined
  }

  const shortName = (source: Source): string => {
    const parts = source.file.split(/[\\/]/)
    const name = parts.slice(-2).join('/')
    return source.line ? `${name}:${source.line}` : name
  }

  // Overlay: an outline over the hovered element and a label with its source
  const box = document.createElement('div')
  box.setAttribute('data-claude-locator', '')
  box.style.cssText =
    'position:fixed;z-index:2147483647;pointer-events:none;display:none;box-sizing:border-box;' +
    'border:2px solid #d97757;background:rgba(217,119,87,0.12);border-radius:3px;'
  const label = document.createElement('div')
  label.style.cssText =
    'position:absolute;left:-2px;bottom:100%;margin-bottom:4px;padding:2px 6px;white-space:nowrap;' +
    'font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;background:#d97757;border-radius:3px;'
  box.appendChild(label)

  let hovered: Element | undefined
  let flashUntil = 0

  const hide = (): void => {
    hovered = undefined
    if (Date.now() >= flashUntil) {
      box.style.display = 'none'
    }
  }

  const show = (element: Element): void => {
    const source = findSource(element)
    if (!source) {
      hide()
      return
    }
    hovered = element
    if (!box.isConnected) {
      document.documentElement.appendChild(box)
    }
    const rect = element.getBoundingClientRect()
    box.style.display = 'block'
    box.style.left = `${rect.left}px`
    box.style.top = `${rect.top}px`
    box.style.width = `${rect.width}px`
    box.style.height = `${rect.height}px`
    if (Date.now() >= flashUntil) {
      label.textContent = shortName(source)
    }
  }

  const flash = (text: string): void => {
    label.textContent = text
    flashUntil = Date.now() + 1200
    setTimeout(() => {
      if (!hovered) {
        box.style.display = 'none'
      }
    }, 1200)
  }

  const open = async (source: Source): Promise<boolean> => {
    const query = new URLSearchParams({ file: source.file })
    if (source.line) {
      query.set('line', String(source.line))
    }
    if (source.column) {
      query.set('column', String(source.column))
    }
    try {
      const response = await fetch(`${options.endpoint}?${query.toString()}`, { method: 'POST' })
      return response.ok
    } catch {
      return false
    }
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (event[options.modifier] && event.target instanceof Element) {
      show(event.target)
    } else if (hovered) {
      hide()
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (!event[options.modifier]) {
      hide()
    }
  }

  // Swallow the press so the app does not act on it (and Option+click on a link does not download it)
  const onPress = (event: MouseEvent): void => {
    if (!event[options.modifier] || event.button !== 0 || !(event.target instanceof Element)) {
      return
    }
    const source = findSource(event.target)
    if (!source) {
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.type !== 'click') {
      return
    }
    show(event.target)
    void open(source).then((isOpened) => flash(isOpened ? `Opened ${shortName(source)}` : 'Not opened: see the dev server'))
  }

  window.addEventListener('mousemove', onMouseMove, true)
  window.addEventListener('keyup', onKeyUp, true)
  window.addEventListener('blur', hide)
  window.addEventListener('mousedown', onPress, true)
  window.addEventListener('pointerdown', onPress, true)
  window.addEventListener('click', onPress, true)

  const api: ClientApi = {
    findSource,
    open,
    dispose: () => {
      window.removeEventListener('mousemove', onMouseMove, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', hide)
      window.removeEventListener('mousedown', onPress, true)
      window.removeEventListener('pointerdown', onPress, true)
      window.removeEventListener('click', onPress, true)
      box.remove()
      delete globalWindow.__claudeLocator
    },
  }
  globalWindow.__claudeLocator = api
  return api
}
