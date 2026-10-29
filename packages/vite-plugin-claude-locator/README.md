# vite-plugin-claude-locator

Hold <kbd>⌥ Option</kbd> and click anything in your running app to open the line that drew it — in the Claude desktop app, Cursor, VS Code, Zed, OpenCode, or on the clipboard for Codex and any agent. <kbd>⌥</kbd>+right-click lists the components above it.

React 18 · 19, Vue 3, Svelte 5, Solid, Preact, Astro and Angular. Development only.

**[Demo](https://scs0209.github.io/claude-locator/) · [Docs](https://github.com/scs0209/claude-locator#readme)**

```ts
// vite.config.ts
import claudeLocator from 'vite-plugin-claude-locator'

export default defineConfig({
  plugins: [react(), claudeLocator({ open: ['claude', 'editor'], editor: 'cursor' })],
})
```

```js
// astro.config.mjs
import claudeLocator from 'vite-plugin-claude-locator/astro'

export default defineConfig({ integrations: [claudeLocator()] })
```

Angular CLI, webpack, Next.js: run `npx claude-locator` beside the dev server, and in development load `vite-plugin-claude-locator/client` and call `startClaudeLocator()`.

For the Claude desktop app's Files pane, also install the Claude Code plugin:

```
/plugin install claude-locator --marketplace scs0209/claude-locator
```

The Claude Code plugin API is early access and may change between releases. Targets, options and how it works: see the [repository README](https://github.com/scs0209/claude-locator#readme).

MIT
