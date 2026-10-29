import path from 'node:path'
import { parse, type ParserPlugin } from '@babel/parser'
import MagicString from 'magic-string'

/** The attribute that carries `<workspace-relative path>:<line>:<column>` on host elements. */
export const SOURCE_ATTRIBUTE = 'data-claude-source'

const JSX_FILE = /\.(?:[cm]?jsx?|tsx)$/

/** Whether a module id is a project file this plugin should tag. */
export const shouldTransform = (id: string): boolean => {
  if (id.startsWith('\0') || id.includes('/node_modules/')) {
    return false
  }
  return JSX_FILE.test(id.split('?', 1)[0])
}

type Node = {
  type: string
  start?: number | null
  end?: number | null
  loc?: { start: { line: number; column: number } } | null
  [key: string]: unknown
}

const SKIPPED_KEYS = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments'])

const visit = (node: unknown, onNode: (node: Node) => void): void => {
  if (Array.isArray(node)) {
    for (const child of node) {
      visit(child, onNode)
    }
    return
  }
  if (!node || typeof node !== 'object' || typeof (node as Node).type !== 'string') {
    return
  }
  onNode(node as Node)
  for (const key of Object.keys(node)) {
    if (!SKIPPED_KEYS.has(key)) {
      visit((node as Node)[key], onNode)
    }
  }
}

const isHostElementName = (name: Node): name is Node & { name: string } =>
  name.type === 'JSXIdentifier' && /^[a-z]/.test(name.name as string)

const hasSourceAttribute = (attributes: Node[]): boolean =>
  attributes.some(
    (attribute) =>
      attribute.type === 'JSXAttribute' &&
      (attribute.name as Node).type === 'JSXIdentifier' &&
      (attribute.name as Node).name === SOURCE_ATTRIBUTE,
  )

/**
 * Adds `data-claude-source="<path>:<line>:<column>"` to every host JSX element (`<div>`, `<button>`, ...)
 * so the browser can map a DOM node back to its source without React's `_debugSource`, which React 19 removed.
 * Components (`<Button>`) are left alone: they may not forward unknown props to the DOM.
 */
export const addSourceAttributes = (
  code: string,
  id: string,
  workspaceRoot: string,
): { code: string; map: ReturnType<MagicString['generateMap']> } | null => {
  if (!code.includes('<')) {
    return null
  }
  const file = id.split('?', 1)[0]
  const plugins: ParserPlugin[] = file.endsWith('.tsx') ? ['jsx', 'typescript'] : ['jsx']

  let ast: unknown
  try {
    ast = parse(code, { sourceType: 'module', plugins, errorRecovery: true })
  } catch {
    // Not ours to report: the next transform in line will show the syntax error
    return null
  }

  const relative = path.relative(workspaceRoot, file).split(path.sep).join('/')
  const magic = new MagicString(code)
  let changed = false

  visit(ast, (node) => {
    if (node.type !== 'JSXOpeningElement') {
      return
    }
    const name = node.name as Node
    if (!isHostElementName(name) || hasSourceAttribute(node.attributes as Node[]) || name.end == null || !node.loc) {
      return
    }
    const { line, column } = node.loc.start
    const value = JSON.stringify(`${relative}:${line}:${column + 1}`)
    magic.appendLeft(name.end, ` ${SOURCE_ATTRIBUTE}={${value}}`)
    changed = true
  })

  if (!changed) {
    return null
  }
  return { code: magic.toString(), map: magic.generateMap({ source: file, hires: 'boundary' }) }
}
