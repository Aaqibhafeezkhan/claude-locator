import { describe, expect, it } from 'vitest'
import { addSourceAttributes, shouldTransform } from '../src/transform'

const root = '/repo'

describe('shouldTransform', () => {
  it('takes project JSX and TSX files, with or without a query', () => {
    expect(shouldTransform('/repo/src/App.tsx')).toBe(true)
    expect(shouldTransform('/repo/src/App.jsx?t=123')).toBe(true)
    expect(shouldTransform('/repo/src/legacy.js')).toBe(true)
  })

  it('skips node_modules, virtual modules and plain TypeScript', () => {
    expect(shouldTransform('/repo/node_modules/lib/index.js')).toBe(false)
    expect(shouldTransform('\0virtual:thing')).toBe(false)
    expect(shouldTransform('/repo/src/util.ts')).toBe(false)
    expect(shouldTransform('/repo/src/style.css')).toBe(false)
  })
})

describe('addSourceAttributes', () => {
  it('tags host elements with path, line and 1-based column', () => {
    const code = ['export const App = () => (', '  <div className="a">', '    <span>hi</span>', '  </div>', ')'].join('\n')
    const result = addSourceAttributes(code, '/repo/src/App.tsx', root)
    expect(result?.code).toContain('<div data-claude-source={"src/App.tsx:2:3"} className="a">')
    expect(result?.code).toContain('<span data-claude-source={"src/App.tsx:3:5"}>')
  })

  it('leaves components, member expressions and fragments alone', () => {
    const code = 'const A = () => <><Button /><motion.div /><Foo.Bar /></>'
    expect(addSourceAttributes(code, '/repo/src/A.tsx', root)).toBeNull()
  })

  it('keeps an attribute the author already wrote', () => {
    const code = 'const A = () => <div data-claude-source="x:1:1" />'
    expect(addSourceAttributes(code, '/repo/src/A.tsx', root)).toBeNull()
  })

  it('parses TypeScript generics and casts in TSX', () => {
    const code = 'function f<T,>(x: T) { return x as unknown as T }\nexport const A = () => <p>{f<number>(1)}</p>'
    expect(addSourceAttributes(code, '/repo/src/A.tsx', root)?.code).toContain('<p data-claude-source={"src/A.tsx:2:24"}>')
  })

  it('returns null for code it cannot parse, leaving the error to the next transform', () => {
    expect(addSourceAttributes('const = <div', '/repo/src/A.tsx', root)).toBeNull()
  })

  it('returns a source map', () => {
    const result = addSourceAttributes('export default () => <i />', '/repo/src/A.jsx', root)
    expect(result?.map.mappings).toBeTruthy()
  })
})
