import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import claudeLocator from 'vite-plugin-claude-locator'

export default defineConfig({
  plugins: [react(), claudeLocator()],
  server: { port: 5119 },
})
