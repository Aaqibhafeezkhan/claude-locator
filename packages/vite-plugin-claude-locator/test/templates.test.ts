import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { addVueSourceAttributes, type VueCompiler } from '../src/templates'

// The compiler the Vue example installs
const require = createRequire(path.resolve(__dirname, '../../../examples/vue/package.json'))
const compiler = require('vue/compiler-sfc') as VueCompiler

const sfc = [
  '<script setup>',
  "import Panel from './Panel.vue'",
  '</script>',
  '',
  '<template>',
  '  <main class="a">',
  '    <Panel><slot /></Panel>',
  '    <template v-if="x"><b>bold</b></template>',
  '    <component :is="y" />',
  '  </main>',
  '</template>',
].join('\n')

describe('addVueSourceAttributes', () => {
  it('tags plain elements with path, line and column, and nothing else', () => {
    const output = addVueSourceAttributes(sfc, '/repo/src/App.vue', '/repo', compiler)!.code
    expect(output).toContain('<main data-claude-source="src/App.vue:6:3" class="a">')
    expect(output).toContain('<b data-claude-source="src/App.vue:8:24">bold</b>')
    expect(output).toContain('<Panel><slot /></Panel>')
    expect(output).toContain('<template v-if="x">')
    expect(output).toContain('<component :is="y" />')
  })

  it('leaves files without a template, or with errors, alone', () => {
    expect(addVueSourceAttributes('<script setup>const a = 1</script>', '/repo/src/A.vue', '/repo', compiler)).toBeNull()
    expect(addVueSourceAttributes('<template><div></template>', '/repo/src/A.vue', '/repo', compiler)).toBeNull()
  })
})
