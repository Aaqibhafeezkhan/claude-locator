import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'
import claudeLocator from 'vite-plugin-claude-locator'

export default defineConfig({
  plugins: [preact(), claudeLocator({ open: (process.env.CLAUDE_LOCATOR_OPEN ?? 'claude').split(',') })],
  server: { port: 5123 },
})
