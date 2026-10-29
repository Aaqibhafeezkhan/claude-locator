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
  const visit = (node: VueNode): void => {
    if (node.type === ELEMENT_NODE && node.tagType === PLAIN_ELEMENT && node.tag) {
      const hasAttribute = node.props?.some((prop) => prop.type === ATTRIBUTE_NODE && prop.name === SOURCE_ATTRIBUTE)
      // `<div` starts at the node's offset, as long as the template is the file's own text
      if (!hasAttribute && code.startsWith(`<${node.tag}`, node.loc.start.offset)) {
        const { line, column } = node.loc.start
        magic.appendLeft(node.loc.start.offset + 1 + node.tag.length, ` ${SOURCE_ATTRIBUTE}="${relative}:${line}:${column}"`)
        changed = true
      }
    }
    node.children?.forEach(visit)
  }
  ast.children?.forEach(visit)

  return changed ? { code: magic.toString(), map: magic.generateMap({ source: file, hires: 'boundary' }) } : null
}
