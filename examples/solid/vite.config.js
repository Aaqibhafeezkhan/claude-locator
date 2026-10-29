import { defineConfig } from 'vite'
import claudeLocator from 'vite-plugin-claude-locator'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid(), claudeLocator({ open: (process.env.CLAUDE_LOCATOR_OPEN ?? 'claude').split(',') })],
  server: { port: 5122 },
})
