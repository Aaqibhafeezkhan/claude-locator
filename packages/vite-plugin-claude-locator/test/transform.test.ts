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

  it('leaves component elements, member expressions and fragments without the attribute', () => {
    const code = 'const a = () => <><Button /><motion.div /><Foo.Bar /></>'
    expect(addSourceAttributes(code, '/repo/src/A.tsx', root)).toBeNull()
  })

  it('keeps an attribute the author already wrote', () => {
    const code = 'const a = () => <div data-claude-source="x:1:1" />'
    expect(addSourceAttributes(code, '/repo/src/A.tsx', root)).toBeNull()
  })

  it('records where each top-level component is defined', () => {
    const code = [
      'export function Card() { return <Button /> }',
      'const Title = () => <Text />',
      'export const Row = memo(function Row() { return <Cell /> })',
      'export default class Page extends Component {}',
      "const Field = React.forwardRef((props, ref) => null), Other = function () { return null }",
      "const MAX = 5, Schema = z.object({}), helper = () => <Box />",
      'function lower() { return <Box /> }',
    ].join('\n')
    const output = addSourceAttributes(code, '/repo/src/Card.tsx', root)!.code
    const tagged = [
      ...output.matchAll(/defineProperty\((\w+),"__claudeSource",\{value:\{"name":"(\w+)","source":"([^"]+)"\}/g),
    ].map(([, variable, name, where]) => `${variable === name ? name : `${variable}!=${name}`} ${where}`)
    expect(tagged).toEqual([
      'Card src/Card.tsx:1:1',
      'Title src/Card.tsx:2:1',
      'Row src/Card.tsx:3:1',
      'Page src/Card.tsx:4:1',
      'Field src/Card.tsx:5:7',
      'Other src/Card.tsx:5:55',
    ])
  })

  it('tags components so that a frozen value cannot break the module', () => {
    const output = addSourceAttributes('export const A = () => <B />', '/repo/src/A.tsx', root)!.code
    const tag = output.slice(output.indexOf('\n;') + 2)
    const component = (): null => null
    new Function('A', tag)(component)
    expect((component as unknown as Record<string, unknown>).__claudeSource).toEqual({ name: 'A', source: 'src/A.tsx:1:1' })
    expect(Object.keys(component)).toEqual([])
    expect(() => new Function('A', tag)(Object.freeze(() => null))).not.toThrow()
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
