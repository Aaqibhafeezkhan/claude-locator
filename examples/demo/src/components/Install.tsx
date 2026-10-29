const VITE = `// vite.config.ts — React, Vue, Svelte, Solid, Preact
import claudeLocator from 'vite-plugin-claude-locator'

export default defineConfig({
  plugins: [react(), claudeLocator({ open: ['claude', 'editor'], editor: 'cursor' })],
})`

const ASTRO = `// astro.config.mjs
import claudeLocator from 'vite-plugin-claude-locator/astro'

export default defineConfig({ integrations: [claudeLocator()] })`

const ANGULAR = `// main.ts — Angular CLI, webpack, Next.js: run \`npx claude-locator\` beside the dev server
if (isDevMode()) {
  import('vite-plugin-claude-locator/client').then((m) => m.startClaudeLocator())
}`

export function Install() {
  return (
    <section className="section install">
      <p className="eyebrow">Install</p>
      <h2>Add it to your app</h2>
      <pre>
        <code>npm install -D vite-plugin-claude-locator</code>
      </pre>
      <div className="install-grid">
        <pre>
          <code>{VITE}</code>
        </pre>
        <pre>
          <code>{ASTRO}</code>
        </pre>
        <pre>
          <code>{ANGULAR}</code>
        </pre>
      </div>
      <p>
        For the Claude desktop app, also run <code>/plugin install claude-locator --marketplace scs0209/claude-locator</code>.
        See the <a href="https://github.com/scs0209/claude-locator#readme">README</a>.
      </p>
    </section>
  )
}
