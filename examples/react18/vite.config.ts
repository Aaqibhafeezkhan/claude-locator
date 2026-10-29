import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import claudeLocator, { type OpenTarget } from 'vite-plugin-claude-locator'

// Pick where a click opens without editing this file:
// CLAUDE_LOCATOR_OPEN=claude,editor CLAUDE_LOCATOR_EDITOR=cursor pnpm dev:react18
const open = (process.env.CLAUDE_LOCATOR_OPEN ?? 'claude').split(',') as OpenTarget[]

export default defineConfig({
  plugins: [react(), claudeLocator({ open, editor: process.env.CLAUDE_LOCATOR_EDITOR })],
  server: { port: 5118 },
})
