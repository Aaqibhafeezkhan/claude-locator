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
  /** The property the JSX transform sets on components, e.g. `__claudeSource`. */
  componentProperty: string
}

export interface Source {
  file: string
  line?: number
  column?: number
}

/** One row of the component tree: the clicked element first, then each component above it. */
export interface TreeItem {
  /** `<button>` for the element, the component's name otherwise. */
  label: string
  /** Where it is written, when that is a file of the project. */
  source?: Source
}

export interface ClientApi {
  /** The source location the plugin opens for this element, if any. */
  findSource: (element: Element) => Source | undefined
  /** The element and the components that rendered it, innermost first. */
  findTree: (element: Element) => TreeItem[]
  /** Sends a location to the dev server; resolves to whether it accepted it. */
  open: (source: Source) => Promise<boolean>
  /** Removes listeners and the overlay. */
  dispose: () => void
}

export function startClaudeLocator(options: ClientOptions): ClientApi {
  type DebugSource = { fileName?: string; lineNumber?: number; columnNumber?: number }
  type ComponentType = {
    displayName?: string
    name?: string
    render?: ComponentType
    type?: ComponentType
    [key: string]: unknown
  }
  type Fiber = {
    type?: unknown
    elementType?: unknown
    _debugSource?: DebugSource | null
    _debugOwner?: Fiber | null
    return?: Fiber | null
  }

  const globalWindow = window as unknown as { __claudeLocator?: ClientApi }
  if (globalWindow.__claudeLocator) {
    globalWindow.__claudeLocator.dispose()
  }

  const isProjectFile = (file: string): boolean => !/[\\/]node_modules[\\/]/.test(file)

  const parsePosition = (value: string): Source => {
    const match = /^(.*):(\d+):(\d+)$/.exec(value)
    return match ? { file: match[1], line: Number(match[2]), column: Number(match[3]) } : { file: value }
  }

  const fromDebugSource = (debugSource: DebugSource | null | undefined): Source | undefined =>
    debugSource && debugSource.fileName && isProjectFile(debugSource.fileName)
      ? { file: debugSource.fileName, line: debugSource.lineNumber, column: debugSource.columnNumber }
      : undefined

  const fiberOf = (element: Element): Fiber | undefined => {
    const key = Object.keys(element).find(
      (name) => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'),
    )
    return key ? (element as unknown as Record<string, Fiber | undefined>)[key] : undefined
  }

  // React 18 and older, without the attribute: each fiber knows where its JSX element was written.
  // Walking `_debugOwner` from a library's element reaches the component in your code that rendered it.
  const sourceFromFiber = (element: Element): Source | undefined => {
    let fiber = fiberOf(element) || null
    for (let depth = 0; fiber && depth < 200; depth += 1) {
      const source = fromDebugSource(fiber._debugSource)
      if (source) {
        return source
      }
      fiber = fiber._debugOwner || null
    }
    return undefined
  }

  // The attribute the JSX transform added: React 19 has no `_debugSource`
  const sourceFromAttribute = (element: Element): Source | undefined => {
    const value = element.getAttribute(options.attribute)
    return value ? parsePosition(value) : undefined
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

  // A component fiber's type is its function or class, or the object `memo` / `forwardRef` returned
  const asComponent = (value: unknown): ComponentType | undefined =>
    typeof value === 'function' || (value && typeof value === 'object' && ('render' in value || 'type' in value))
      ? (value as ComponentType)
      : undefined

  const componentName = (type: ComponentType | undefined, depth = 0): string | undefined => {
    if (!type || depth > 3) {
      return undefined
    }
    return type.displayName || type.name || componentName(type.render, depth + 1) || componentName(type.type, depth + 1)
  }

  // What the transform recorded on the component: its declared name and where it is defined
  const componentTag = (fiber: Fiber): { name: string; source: string } | undefined => {
    for (const candidate of [fiber.type, fiber.elementType].map(asComponent)) {
      for (const type of [candidate, candidate?.render, candidate?.type]) {
        const value = type && (type[options.componentProperty] as { name?: unknown; source?: unknown } | undefined)
        if (value && typeof value.name === 'string' && typeof value.source === 'string') {
          return { name: value.name, source: value.source }
        }
      }
    }
    return undefined
  }

  const findTree = (start: Element): TreeItem[] => {
    const items: TreeItem[] = [{ label: `<${start.tagName.toLowerCase()}>`, source: findSource(start) }]
    let fiber = fiberOf(start)?.return || null
    for (let depth = 0; fiber && depth < 500 && items.length < 40; depth += 1) {
      const tag = componentTag(fiber)
      const name = tag ? tag.name : componentName(asComponent(fiber.type))
      if (name) {
        // Without the transform (React 18): where the component was used, not where it is defined
        const source = tag ? parsePosition(tag.source) : fromDebugSource(fiber._debugSource)
        const last = items[items.length - 1]
        // `memo(Card)` puts two fibers for the same component in a row
        const isRepeat = last.label === name && last.source?.file === source?.file && last.source?.line === source?.line
        if (!isRepeat) {
          items.push({ label: name, source })
        }
      }
      fiber = fiber.return || null
    }
    return items
  }

  const shortName = (source: Source): string => {
    const name = source.file.split(/[\\/]/).slice(-2).join('/')
    return source.line ? `${name}:${source.line}` : name
  }

  const font = 'font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;'
  const accent = '#d97757'

  // Overlay: an outline over the hovered element and a label with its source
  const box = document.createElement('div')
  box.setAttribute('data-claude-locator', '')
  box.style.cssText =
    'position:fixed;z-index:2147483646;pointer-events:none;display:none;box-sizing:border-box;' +
    `border:2px solid ${accent};background:rgba(217,119,87,0.12);border-radius:3px;`
  const label = document.createElement('div')
  label.style.cssText =
    'position:absolute;left:-2px;bottom:100%;margin-bottom:4px;padding:2px 6px;white-space:nowrap;' +
    `${font}color:#fff;background:${accent};border-radius:3px;`
  box.appendChild(label)

  // Tree: the element and the components above it, opened with the modifier and a right-click
  const menu = document.createElement('div')
  menu.setAttribute('data-claude-locator', '')
  menu.setAttribute('role', 'menu')
  menu.style.cssText =
    'position:fixed;z-index:2147483647;display:none;min-width:220px;max-width:min(520px,90vw);max-height:60vh;' +
    'overflow:auto;padding:4px;box-sizing:border-box;background:#1f1e1d;color:#f5f4ef;border-radius:6px;' +
    `box-shadow:0 6px 24px rgba(0,0,0,0.35);${font}`

  let hovered: Element | undefined
  let flashUntil = 0

  const hide = (): void => {
    hovered = undefined
    if (Date.now() >= flashUntil) {
      box.style.display = 'none'
    }
  }

  const mount = (element: HTMLElement): void => {
    if (!element.isConnected) {
      document.documentElement.appendChild(element)
    }
  }

  const show = (element: Element): void => {
    const source = findSource(element)
    if (!source) {
      hide()
      return
    }
    hovered = element
    mount(box)
    const rect = element.getBoundingClientRect()
    box.style.display = 'block'
    box.style.left = `${rect.left}px`
    box.style.top = `${rect.top}px`
    box.style.width = `${rect.width}px`
    box.style.height = `${rect.height}px`
    if (Date.now() >= flashUntil) {
      const owner = findTree(element)[1]
      label.textContent = owner ? `${owner.label} · ${shortName(source)}` : shortName(source)
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

  const openAndFlash = (source: Source): void => {
    void open(source).then((isOpened) => flash(isOpened ? `Opened ${shortName(source)}` : 'Not opened: see the dev server'))
  }

  const closeMenu = (): void => {
    menu.style.display = 'none'
    menu.textContent = ''
  }

  const showMenu = (element: Element, x: number, y: number): void => {
    closeMenu()
    for (const item of findTree(element)) {
      const row = document.createElement('button')
      row.type = 'button'
      row.setAttribute('role', 'menuitem')
      row.disabled = !item.source
      row.style.cssText =
        'display:flex;gap:16px;justify-content:space-between;width:100%;padding:3px 8px;border:0;border-radius:4px;' +
        `background:transparent;text-align:left;${font}color:${item.source ? 'inherit' : '#8a8780'};` +
        `cursor:${item.source ? 'pointer' : 'default'};`
      const name = document.createElement('span')
      name.textContent = item.label
      const where = document.createElement('span')
      where.style.cssText = 'opacity:0.65;white-space:nowrap;'
      where.textContent = item.source ? shortName(item.source) : 'not in project'
      row.append(name, where)
      if (item.source) {
        const source = item.source
        row.addEventListener('mouseenter', () => (row.style.background = 'rgba(217,119,87,0.35)'))
        row.addEventListener('mouseleave', () => (row.style.background = 'transparent'))
        row.addEventListener('click', (event) => {
          event.stopPropagation()
          closeMenu()
          show(element)
          openAndFlash(source)
        })
      }
      menu.appendChild(row)
    }
    mount(menu)
    menu.style.display = 'block'
    const { width, height } = menu.getBoundingClientRect()
    menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - width - 4))}px`
    menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - height - 4))}px`
  }

  const isOwnUi = (target: EventTarget | null): boolean => target instanceof Node && menu.contains(target)

  const onMouseMove = (event: MouseEvent): void => {
    if (isOwnUi(event.target)) {
      return
    }
    if (event[options.modifier] && event.target instanceof Element) {
      show(event.target)
    } else if (hovered) {
      hide()
    }
  }

  const onKey = (event: KeyboardEvent): void => {
    if (event.type === 'keydown' && event.key === 'Escape') {
      closeMenu()
    }
    if (event.type === 'keyup' && !event[options.modifier]) {
      hide()
    }
  }

  // Swallow the press so the app does not act on it (and Option+click on a link does not download it)
  const onPress = (event: MouseEvent): void => {
    if (isOwnUi(event.target)) {
      return
    }
    if (menu.style.display !== 'none') {
      closeMenu()
    }
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
    openAndFlash(source)
  }

  const onContextMenu = (event: MouseEvent): void => {
    if (!event[options.modifier] || !(event.target instanceof Element) || isOwnUi(event.target)) {
      return
    }
    if (findTree(event.target).every((item) => !item.source)) {
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    showMenu(event.target, event.clientX, event.clientY)
  }

  window.addEventListener('mousemove', onMouseMove, true)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('keyup', onKey, true)
  window.addEventListener('blur', hide)
  window.addEventListener('mousedown', onPress, true)
  window.addEventListener('pointerdown', onPress, true)
  window.addEventListener('click', onPress, true)
  window.addEventListener('contextmenu', onContextMenu, true)

  const api: ClientApi = {
    findSource,
    findTree,
    open,
    dispose: () => {
      window.removeEventListener('mousemove', onMouseMove, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKey, true)
      window.removeEventListener('blur', hide)
      window.removeEventListener('mousedown', onPress, true)
      window.removeEventListener('pointerdown', onPress, true)
      window.removeEventListener('click', onPress, true)
      window.removeEventListener('contextmenu', onContextMenu, true)
      box.remove()
      menu.remove()
      delete globalWindow.__claudeLocator
    },
  }
  globalWindow.__claudeLocator = api
  return api
}
