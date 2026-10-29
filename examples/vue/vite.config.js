import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import claudeLocator from 'vite-plugin-claude-locator'

export default defineConfig({
  plugins: [vue(), claudeLocator({ open: (process.env.CLAUDE_LOCATOR_OPEN ?? 'claude').split(',') })],
  server: { port: 5121 },
})
