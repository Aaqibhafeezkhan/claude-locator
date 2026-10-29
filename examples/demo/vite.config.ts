import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import claudeLocator from 'vite-plugin-claude-locator'

// The public demo: built with the plugin on (`inBuild`), and a click opens the file on GitHub
// instead of on this machine. Never use `inBuild` for a real production build.
export default defineConfig({
  base: process.env.DEMO_BASE ?? '/',
  plugins: [
    react(),
    claudeLocator({
      inBuild: true,
      open: [{ url: 'https://github.com/scs0209/claude-locator/blob/main/{path}#L{line}' }],
    }),
  ],
  server: { port: 5130 },
})
