# vite-plugin-claude-locator

Hold <kbd>Option</kbd> (<kbd>Alt</kbd>) and click an element of your React app in the Vite dev server to open its source file and line in the Claude desktop app's **Files** pane.

This is the Vite half. It needs the `claude-locator` Claude Code plugin too, which opens the file in the app:

```
/plugin install claude-locator --marketplace scs0209/claude-locator
```

```ts
// vite.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import claudeLocator from 'vite-plugin-claude-locator'

export default defineConfig({
  plugins: [react(), claudeLocator()],
})
```

Works with React 18 and 19, dev server only: a `data-claude-source` attribute added at transform time, with fiber `_debugSource` as the fallback on React 18.

How it works, the options and the limits (the Claude Code plugin API is early access and may change between releases): see the [repository README](https://github.com/scs0209/claude-locator#readme).

MIT
