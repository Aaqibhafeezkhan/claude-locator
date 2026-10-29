import path from 'node:path'
import MagicString from 'magic-string'
import { SOURCE_ATTRIBUTE, type TransformResult } from './transform'

/** The part of `@vue/compiler-sfc` this module uses. */
export interface VueCompiler {
  parse: (
    source: string,
    options: { filename: string },
  ) => { descriptor: { template: { ast?: VueNode } | null }; errors: unknown[] }
}

type VueNode = {
  type: number
  tag?: string
  tagType?: number
  props?: { type: number; name?: string }[]
  loc: { start: { offset: number; line: number; column: number } }
  children?: VueNode[]
}

// @vue/compiler-core's NodeTypes.ELEMENT, ElementTypes.ELEMENT and NodeTypes.ATTRIBUTE
const ELEMENT_NODE = 1
const PLAIN_ELEMENT = 0
const ATTRIBUTE_NODE = 6

// Relative to the workspace, ready to sit inside a double-quoted HTML attribute
const relativePath = (file: string, workspaceRoot: string): string =>
  path.relative(workspaceRoot, file).split(path.sep).join('/').replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/**
 * Adds `data-claude-source="<path>:<line>:<column>"` to every plain element (`<div>`, `<button>`, ...) of a Vue
 * single-file component's template. Components, `<slot>`, `<template>` and `<component>` are left alone.
 * The template AST's offsets count from the start of the file, so the attribute goes straight into the source.
 */
export const addVueSourceAttributes = (
  code: string,
  id: string,
  workspaceRoot: string,
  compiler: VueCompiler,
): TransformResult | null => {
  const file = id.split('?', 1)[0]
  let ast: VueNode | undefined
  try {
    const { descriptor, errors } = compiler.parse(code, { filename: file })
    ast = errors.length === 0 ? descriptor.template?.ast : undefined
  } catch {
    return null
  }
  if (!ast) {
    return null
  }

  const relative = relativePath(file, workspaceRoot)
  const magic = new MagicString(code)
  let changed = false
  const visitVue = (node: VueNode): void => {
    if (node.type === ELEMENT_NODE && node.tagType === PLAIN_ELEMENT && node.tag) {
      const hasAttribute = node.props?.some((prop) => prop.type === ATTRIBUTE_NODE && prop.name === SOURCE_ATTRIBUTE)
      // `<div` starts at the node's offset, as long as the template is the file's own text
      if (!hasAttribute && code.startsWith(`<${node.tag}`, node.loc.start.offset)) {
        const { line, column } = node.loc.start
        magic.appendLeft(node.loc.start.offset + 1 + node.tag.length, ` ${SOURCE_ATTRIBUTE}="${relative}:${line}:${column}"`)
        changed = true
      }
    }
    node.children?.forEach(visitVue)
  }
  ast.children?.forEach(visitVue)

  return changed ? { code: magic.toString(), map: magic.generateMap({ source: file, hires: 'boundary' }) } : null
}

/**
 * The part of Astro's compiler this module uses: `@astrojs/compiler` (Astro up to 6, written in Go) answers a tree of
 * `element` nodes with line and column; `@astrojs/compiler-rs` (Astro 7) answers JSX nodes with offsets.
 */
export interface AstroCompiler {
  parse: (source: string, options: { position: boolean }) => Promise<{ ast: unknown }> | { ast: unknown }
}

type GoAstroNode = {
  type: string
  name?: string
  position?: { start: { line: number; column: number } }
  children?: GoAstroNode[]
}

type JsxNode = { type?: string; start?: number; name?: { type?: string; name?: string; end?: number }; [key: string]: unknown }

// Elements that are not drawn, or that the page itself is made of
const ASTRO_SKIPPED = new Set(['html', 'head', 'meta', 'title', 'link', 'script', 'style', 'base', 'slot'])

/**
 * Adds `data-claude-source` to every plain element of an Astro component's template, wherever `<tag` is found at
 * the position the compiler gives (offsets may count bytes rather than characters; those are converted).
 */
export const addAstroSourceAttributes = async (
  code: string,
  id: string,
  workspaceRoot: string,
  compiler: AstroCompiler,
): Promise<TransformResult | null> => {
  const file = id.split('?', 1)[0]
  let ast: unknown
  try {
    ast = (await compiler.parse(code, { position: true })).ast
  } catch {
    return null
  }

  const lineStarts = [0]
  for (let index = code.indexOf('\n'); index !== -1; index = code.indexOf('\n', index + 1)) {
    lineStarts.push(index + 1)
  }
  const lineAndColumn = (offset: number): { line: number; column: number } => {
    let line = lineStarts.length
    while (lineStarts[line - 1] > offset) {
      line -= 1
    }
    return { line, column: offset - lineStarts[line - 1] + 1 }
  }
  const bytes = Buffer.from(code)
  const isTagAt = (offset: number, name: string): boolean =>
    code.startsWith(`<${name}`, offset) && !/[\w-]/.test(code[offset + name.length + 1] ?? '')

  const relative = relativePath(file, workspaceRoot)
  const magic = new MagicString(code)
  let changed = false
  const tag = (name: string, offset: number): void => {
    if (ASTRO_SKIPPED.has(name)) {
      return
    }
    // As given, else as a UTF-8 byte offset
    const at = isTagAt(offset, name) ? offset : bytes.subarray(0, offset).toString().length
    if (!isTagAt(at, name)) {
      return
    }
    const { line, column } = lineAndColumn(at)
    magic.appendLeft(at + 1 + name.length, ` ${SOURCE_ATTRIBUTE}="${relative}:${line}:${column}"`)
    changed = true
  }

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!node || typeof node !== 'object') {
      return
    }
    const goNode = node as GoAstroNode
    const jsxNode = node as JsxNode
    if (goNode.type === 'element' && goNode.name && goNode.position) {
      const { line, column } = goNode.position.start
      tag(goNode.name, (lineStarts[line - 1] ?? -1) + column - 1)
    } else if (
      jsxNode.type === 'JSXOpeningElement' &&
      jsxNode.name?.type === 'JSXIdentifier' &&
      /^[a-z]/.test(jsxNode.name.name ?? '') &&
      typeof jsxNode.start === 'number'
    ) {
      tag(jsxNode.name.name!, jsxNode.start)
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'frontmatter' && key !== 'position' && value && typeof value === 'object') {
        visit(value)
      }
    }
  }
  visit(ast)

  return changed ? { code: magic.toString(), map: magic.generateMap({ source: file, hires: 'boundary' }) } : null
}
