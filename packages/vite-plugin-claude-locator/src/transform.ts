import path from 'node:path'
import { parse, type ParserPlugin } from '@babel/parser'
import MagicString from 'magic-string'

/** The attribute that carries `<workspace-relative path>:<line>:<column>` on host elements. */
export const SOURCE_ATTRIBUTE = 'data-claude-source'

/**
 * The property that carries a component's definition: `{ name, source }`, `source` being
 * `<workspace-relative path>:<line>:<column>`. The name is the declared one, which bundlers may rename
 * (`memo(function Panel)` inside `const Panel` comes out as `Panel2`).
 */
export const COMPONENT_SOURCE_PROPERTY = '__claudeSource'

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

const isComponentName = (name: unknown): name is string => typeof name === 'string' && /^[A-Z]/.test(name)

const WRAPPERS = new Set(['memo', 'forwardRef'])

// `memo(...)`, `forwardRef(...)`, `React.memo(...)`, and the two nested
const isComponentWrapper = (node: Node): boolean => {
  if (node.type !== 'CallExpression') {
    return false
  }
  const callee = node.callee as Node
  const name =
    callee.type === 'Identifier'
      ? callee.name
      : callee.type === 'MemberExpression' && (callee.property as Node).type === 'Identifier'
        ? (callee.property as Node).name
        : undefined
  return WRAPPERS.has(name as string)
}

const isComponentValue = (node: Node | null | undefined): boolean =>
  !!node &&
  (node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ClassExpression' ||
    isComponentWrapper(node))

type ComponentDefinition = { name: string; node: Node }

/** Components declared at the top level of a module, by name, with the node where each is written. */
const findComponentDefinitions = (program: Node): ComponentDefinition[] => {
  const found: ComponentDefinition[] = []
  const fromDeclaration = (declaration: Node | null | undefined, at: Node): void => {
    if (!declaration) {
      return
    }
    if (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') {
      const name = (declaration.id as Node | null)?.name
      if (isComponentName(name)) {
        found.push({ name, node: at })
      }
      return
    }
    if (declaration.type === 'VariableDeclaration') {
      const declarators = declaration.declarations as Node[]
      for (const declarator of declarators) {
        const id = declarator.id as Node
        if (id.type === 'Identifier' && isComponentName(id.name) && isComponentValue(declarator.init as Node)) {
          // `export const A = ...` points at the statement; `const A = ..., B = ...` at each declarator
          found.push({ name: id.name, node: declarators.length > 1 ? declarator : at })
        }
      }
    }
  }
  for (const statement of program.body as Node[]) {
    if (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration') {
      fromDeclaration(statement.declaration as Node, statement)
    } else {
      fromDeclaration(statement, statement)
    }
  }
  return found
}

export type TransformResult = { code: string; map: ReturnType<MagicString['generateMap']> }

/**
 * Tags a module with where things are written, so the browser can map the page back to source without React's
 * `_debugSource` (React 19 removed it; @vitejs/plugin-react 4 shifts its lines):
 * - every host JSX element (`<div>`, `<button>`, ...) gets `data-claude-source="<path>:<line>:<column>"`;
 * - every top-level component (`function Button`, `const Card = memo(...)`) gets a non-enumerable
 *   `__claudeSource` property (`{ name, source }`) after the module body, read from the fiber's `type` to build
 *   the component tree.
 * Component elements (`<Button>`) get no attribute: they may not forward unknown props to the DOM.
 */
export const addSourceAttributes = (code: string, id: string, workspaceRoot: string): TransformResult | null => {
  if (!code.includes('<')) {
    return null
  }
  const file = id.split('?', 1)[0]
  const plugins: ParserPlugin[] = file.endsWith('.tsx') ? ['jsx', 'typescript'] : ['jsx']

  let ast: Node
  try {
    ast = parse(code, { sourceType: 'module', plugins, errorRecovery: true }) as unknown as Node
  } catch {
    // Not ours to report: the next transform in line will show the syntax error
    return null
  }

  const relative = path.relative(workspaceRoot, file).split(path.sep).join('/')
  const where = (node: Node): string => `${relative}:${node.loc!.start.line}:${node.loc!.start.column + 1}`
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
    magic.appendLeft(name.end, ` ${SOURCE_ATTRIBUTE}={${JSON.stringify(where(node))}}`)
    changed = true
  })

  const tags = findComponentDefinitions(ast.program as Node)
    .filter(({ node }) => node.loc)
    .map(
      ({ name, node }) =>
        `try{Object.defineProperty(${name},${JSON.stringify(COMPONENT_SOURCE_PROPERTY)},` +
        `{value:${JSON.stringify({ name, source: where(node) })},configurable:true})}catch(_){}`,
    )
  if (tags.length > 0) {
    magic.append(`\n;${tags.join(';')}\n`)
    changed = true
  }

  if (!changed) {
    return null
  }
  return { code: magic.toString(), map: magic.generateMap({ source: file, hires: 'boundary' }) }
}
