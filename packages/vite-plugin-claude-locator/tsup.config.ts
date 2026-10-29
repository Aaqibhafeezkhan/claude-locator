import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/astro.ts', 'src/browser.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    // client.ts and devtools-hook.ts are inlined into the page with Function#toString,
    // so they must reach the bundle untouched: no minifying, no renaming helpers.
    target: 'es2020',
    minify: false,
    keepNames: false,
  },
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    target: 'node18',
    banner: { js: '#!/usr/bin/env node' },
  },
])
