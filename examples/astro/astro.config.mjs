import react from '@astrojs/react'
import { defineConfig } from 'astro/config'
import claudeLocator from 'vite-plugin-claude-locator/astro'

export default defineConfig({
  integrations: [react(), claudeLocator({ open: (process.env.CLAUDE_LOCATOR_OPEN ?? 'claude').split(',') })],
  server: { port: 5124 },
})
