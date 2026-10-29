# claude-locator

Hold <kbd>Option</kbd> (<kbd>Alt</kbd>) and click any element of your React app in the Vite dev server: the Claude desktop app opens the file and line that rendered it in its side **Files** pane, next to your Claude Code session.

It works in any browser, including the Claude desktop app's built-in browser, which has no React DevTools extension and does not hand `cursor://` / `vscode://` links to your editor.

It has two parts, and you need both:

| Part | Where it runs | What it does |
| --- | --- | --- |
| [`vite-plugin-claude-locator`](packages/vite-plugin-claude-locator) | your Vite dev server and the page | finds the source of the clicked element and writes it to a small signal file |
| [`claude-locator` plugin](plugin) | Claude Code, in the desktop app | watches that file and opens the source in the session's Files pane |

## Install

### 1. The Vite plugin

```bash
npm install -D vite-plugin-claude-locator
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

It only runs under `vite` / `vite dev` (`apply: 'serve'`); production builds are untouched.

### 2. The Claude Code plugin

At the prompt of a Claude Code terminal session:

```
/plugin install claude-locator --marketplace scs0209/claude-locator
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it load in every session, desktop app sessions included).

From a shell:

```bash
claude plugin install claude-locator --marketplace scs0209/claude-locator
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `scs0209/claude-locator`, then **Add plugin**.

## Use

1. Open a Claude Code session in the desktop app on your project folder (or a folder above it, such as a monorepo root).
2. Start the dev server and open the page, in the app's built-in browser or any other browser.
3. Hold <kbd>Option</kbd>: hovered elements get an outline and a label with their source. Click: the Files pane opens at that line.

The click never reaches your app (and <kbd>Option</kbd>+click on a link does not download it).

## How it works

```
 browser                         Vite dev server                       Claude Code (desktop app)
 ───────                         ───────────────                       ─────────────────────────
 Option+click <button>
   │ find source:
   │  data-claude-source (added at transform time)
   │  else fiber._debugSource (React 18)
   │
   └─ POST <base>/__claude-open ──▶ check file is inside the workspace
        ?file=src/App.tsx&line=12   write node_modules/.cache/
                                      claude-locator/open.json ──────▶ plugin polls the file (400 ms)
                                      { file, line, column, at }        new `at` → ccd_view.show_pane
                                                                          { pane: 'file', path, line }
```

**Finding the source.** On a click the page walks up from the clicked DOM node:

1. **`data-claude-source`** (React 18 and 19) — the plugin adds `data-claude-source="<path>:<line>:<column>"` to every host JSX element (`<div>`, `<button>`, …) in your project files at transform time, with `@babel/parser` and `magic-string`, ahead of `@vitejs/plugin-react` or `plugin-react-swc`, so the position is the one in the file as you wrote it. The nearest element that has it wins. Components (`<Button>`) are not tagged, since they may not pass unknown props to the DOM, so a click inside a library component opens the nearest host element of yours around it.
2. **Fiber `_debugSource`** (React 18 and older), when no element up the tree has the attribute (`jsxSource: false`, or files the transform skipped). The plugin reads the fiber straight off the DOM node (`__reactFiber$…`), so it does not need the React DevTools hook. When the element comes from `node_modules`, it follows `_debugOwner` up to the component in your code that rendered it. React 19 removed `_debugSource`, so there this step finds nothing.

Why the attribute comes first even on React 18: with `@vitejs/plugin-react` 4.x, the JSX is compiled after React Refresh code has been prepended to the module, and `_debugSource.lineNumber` comes out shifted by those lines (in the sample app, line 25 for a `<button>` on line 6).

**Passing it to Claude.** The endpoint `<base>/__claude-open` is served by the dev server only. It refuses a file outside the workspace root or one that does not exist (400) and cross-site requests (403), then writes `{ file, line, column, at }` to `node_modules/.cache/claude-locator/open.json` under the workspace root, in a single rename. The Claude Code plugin, a hooks module, starts on `session.start`, looks for that file in the session folder and every folder above it, and on each new `at` calls the desktop app's `ccd_view` → `show_pane` tool.

## Options

```ts
claudeLocator({
  workspaceRoot: '/abs/path', // default: Vite's workspace root (monorepo root, else project root)
  signalFile: 'node_modules/.cache/claude-locator/open.json', // relative to workspaceRoot
  jsxSource: true,            // add data-claude-source; React 19 needs it, React 18 falls back to _debugSource
  exclude: [/\.stories\.tsx$/], // files the JSX transform skips
  modifier: 'alt',            // 'alt' | 'ctrl' | 'meta' | 'shift'
  patchDevtoolsHook: false,   // see below
})
```

`patchDevtoolsHook: true` fixes `__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers` in browsers without the React DevTools extension. Without the extension the only hook is the stub React Refresh creates, whose `inject` returns an id but keeps nothing, so tools that read `renderers` (LocatorJS, for one) report "No source info found". The option inlines a script before every module script that makes `inject` keep each renderer. claude-locator does not need it; turn it on if you also use such a tool.

## Limits

- **The Claude Code plugin API is early access.** Hooks modules and the desktop app's `ccd_view` tool may change between Claude Code releases without notice, and this plugin may stop working until it is updated. It was written against Claude Code 2.1.309.
- **Claude desktop app only.** `show_pane` is a tool of the desktop app's Code tab; a terminal session has no Files pane, and the plugin then shows a toast.
- **The file must be inside the session's folder** (its working directory or a folder you granted it). The dev server's workspace root must be the session folder or one of the folders below it, since the plugin looks for the signal file from the session folder upwards.
- **Every session watching the same folder opens the file**, each in its own pane.
- **Vite + React only**, with an `index.html` the dev server serves (`transformIndexHtml` injects the client). Frameworks that render HTML themselves (SSR) are not covered yet.
- **Granularity**: the attribute points at host elements, not at the component usage that wrapped them.
- Lowercase JSX tags that are not DOM elements (`@react-three/fiber`'s `<mesh>`) get the attribute too; list such files in `exclude`.

## Develop

```bash
pnpm install
pnpm test            # Vite plugin unit tests (Vitest)
claude plugin test plugin   # Claude Code plugin tests
pnpm build          # the samples use the built package
pnpm dev:react18     # sample app on http://localhost:5118
pnpm dev:react19     # sample app on http://localhost:5119
```

To try the Claude Code plugin from this folder without installing it, start a session with `claude --plugin-dir ./plugin`.

## License

MIT
