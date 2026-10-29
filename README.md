# claude-locator

Hold <kbd>Option</kbd> (<kbd>Alt</kbd>) and click any element of your React app in the Vite dev server: the Claude desktop app opens the file and line that rendered it in its side **Files** pane, next to your Claude Code session. <kbd>Option</kbd>+right-click lists the components above it, to open any of them.

It works in any browser, including the built-in browsers of coding agents, which have no React DevTools extension and often do not hand `cursor://` / `vscode://` links to your editor: the dev server opens the file, not the browser. Besides the Claude desktop app it can open your editor (Cursor, VS Code, Windsurf, Zed, WebStorm, ...) or call a function of yours.

For the Claude desktop app it has two parts, and you need both:

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
3. Hold <kbd>Option</kbd>: hovered elements get an outline and a label with the component and the source. Click: the Files pane opens at that line.
4. <kbd>Option</kbd>+right-click: a menu lists the element and every component above it, each with the file and line where it is defined. Click a row to open it; rows from `node_modules` are greyed out.

```
<button>   src/Counter.tsx:6
Counter    src/Counter.tsx:3
Panel      src/Panel.tsx:3
App        src/App.tsx:4
```

The click never reaches your app (and <kbd>Option</kbd>+click on a link does not download it).

## Other coding agents and editors

What decides where a click opens is the `open` option, not the browser:

```ts
claudeLocator({ open: ['claude', 'editor'], editor: 'cursor' })
```

| Target | Opens in | Needs |
| --- | --- | --- |
| `'claude'` (default) | the Claude desktop app's Files pane | the Claude Code plugin above |
| `'editor'` | your editor, through its command-line launcher, as Vite's own `/__open-in-editor` does ([`launch-editor`](https://github.com/vitejs/launch-editor)) | the launcher on `PATH`: `cursor`, `code`, `windsurf`, `zed`, `webstorm`, ... |
| a function | wherever you send it | `(location) => void`, called on the dev server with `{ file, line, column, at }` |

So in Cursor, Windsurf or VS Code with an agent, the agent's built-in browser can stay the browser and the file opens in the editor next to it. `editor` names the launcher; left out, `LAUNCH_EDITOR`, then `EDITOR`, then the editor that is running decides. Some installs put an agent CLI on `PATH` under the editor's name (Cursor's `~/.local/bin/cursor` shim runs the editor only when the IDE's own `cursor` is also on `PATH`); give the full path then, such as `/Applications/Cursor.app/Contents/Resources/app/bin/cursor`.

Tried: the Claude desktop app, and Cursor through its launcher on macOS. Other editors go through the same `launch-editor` package Vite uses but have not been tried with this plugin.

## How it works

```
 browser                         Vite dev server                       Claude Code (desktop app)
 ───────                         ───────────────                       ─────────────────────────
 Option+click <button>
   │ find source:
   │  data-claude-source (added at transform time)
   │  else fiber._debugSource (React 18)
   │ Option+right-click: the tree from
   │  fiber.return + __claudeSource
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

**The component tree.** The transform also records each top-level component of a module (`function Card`, `const Row = memo(...)`, `forwardRef`, classes) on the component itself, as a non-enumerable `__claudeSource` property holding its declared name and where it is defined. The menu walks the fiber's `return` chain from the clicked element and reads that property from each component's type, so it works the same on React 18 and 19. Components the transform did not see (libraries, `jsxSource: false`) show by name, with their `_debugSource` usage site on React 18 and nothing on React 19.

Why the attribute comes first even on React 18: with `@vitejs/plugin-react` 4.x, the JSX is compiled after React Refresh code has been prepended to the module, and `_debugSource.lineNumber` comes out shifted by those lines (in the sample app, line 25 for a `<button>` on line 6).

**Passing it on.** The endpoint `<base>/__claude-open` is served by the dev server only. It refuses a file outside the workspace root or one that does not exist (400) and cross-site requests (403), then hands the location to each `open` target; one failing does not stop the others (500 only when all fail). The `'claude'` target writes `{ file, line, column, at }` to `node_modules/.cache/claude-locator/open.json` under the workspace root, in a single rename. The Claude Code plugin, a hooks module, starts on `session.start`, looks for that file in the session folder and every folder above it, and on each new `at` calls the desktop app's `ccd_view` → `show_pane` tool.

## Options

```ts
claudeLocator({
  open: ['claude'],           // 'claude' | 'editor' | (location) => void, or a list of them
  editor: 'cursor',           // launcher for the 'editor' target; default LAUNCH_EDITOR, EDITOR, then a guess
  workspaceRoot: '/abs/path', // default: Vite's workspace root (monorepo root, else project root)
  signalFile: 'node_modules/.cache/claude-locator/open.json', // relative to workspaceRoot
  jsxSource: true,            // tag elements and components; React 19 needs it, React 18 falls back to _debugSource
  exclude: [/\.stories\.tsx$/], // files the JSX transform skips
  modifier: 'alt',            // 'alt' | 'ctrl' | 'meta' | 'shift'
  patchDevtoolsHook: false,   // see below
})
```

`patchDevtoolsHook: true` fixes `__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers` in browsers without the React DevTools extension. Without the extension the only hook is the stub React Refresh creates, whose `inject` returns an id but keeps nothing, so tools that read `renderers` (LocatorJS, for one) report "No source info found". The option inlines a script before every module script that makes `inject` keep each renderer. claude-locator does not need it; turn it on if you also use such a tool.

## Limits

- **The Claude Code plugin API is early access.** Hooks modules and the desktop app's `ccd_view` tool may change between Claude Code releases without notice, and this plugin may stop working until it is updated. It was written against Claude Code 2.1.309.
- **The `'claude'` target needs the Claude desktop app.** `show_pane` is a tool of the desktop app's Code tab; a terminal session has no Files pane, and the plugin then shows a toast. The pane opens only while the session is open in a window.
- **The file must be inside the session's folder** (its working directory or a folder you granted it). The dev server's workspace root must be the session folder or one of the folders below it, since the plugin looks for the signal file from the session folder upwards.
- **Every session watching the same folder opens the file**, each in its own pane.
- **Vite + React only**, with an `index.html` the dev server serves (`transformIndexHtml` injects the client). Frameworks that render HTML themselves (SSR) are not covered yet.
- **Granularity**: a click opens the host element; component definitions are in the tree menu. Only top-level components get a definition; components declared inside functions show by name only.
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
