# Contributing to claude-locator

Thanks for looking. Bug reports from a setup we have not tried (a framework, an editor, an agent's built-in browser) are as useful as code. If something did not land on the right file and line, [open an issue](https://github.com/scs0209/claude-locator/issues/new/choose) with your framework, editor and browser.

Looking for something to pick up? See [`good first issue`](https://github.com/scs0209/claude-locator/labels/good%20first%20issue) and [`help wanted`](https://github.com/scs0209/claude-locator/labels/help%20wanted). Questions and ideas go to [Discussions](https://github.com/scs0209/claude-locator/discussions).

## Set up

Node 20 or newer and pnpm (the repository pins its version through `packageManager`).

```bash
pnpm install
pnpm build        # the sample apps use the built package
pnpm test         # Vitest
pnpm typecheck
```

Run a sample app and Option+click around:

```bash
pnpm --filter example-react19 dev    # or react18, vue, svelte, solid, preact, astro, angular, demo
```

Each sample picks its targets from the environment, so you can try another one without editing it:

```bash
CLAUDE_LOCATOR_OPEN=clipboard,editor CLAUDE_LOCATOR_EDITOR=code pnpm --filter example-react19 dev
```

The Angular sample talks to the standalone server: run `node packages/vite-plugin-claude-locator/dist/cli.js` in `examples/angular` beside `pnpm --filter example-angular dev`.

## Where things are

```
packages/vite-plugin-claude-locator/   the npm package
  src/index.ts        the Vite plugin: options, transforms, endpoint, page script
  src/transform.ts    JSX: data-claude-source on elements, __claudeSource on components
  src/templates.ts    Vue and Astro templates
  src/client.ts       the page script: overlay, finding the source, the tree menu
                      (inlined with Function#toString: no imports in it)
  src/server.ts       the /__claude-open endpoint
  src/targets.ts      where a click goes: claude, editor, opencode, clipboard, url, function
  src/editor.ts       editor launchers
  src/opencode.ts     OpenCode TUI prompt
  src/standalone.ts   `npx claude-locator`, for dev servers without Vite plugins
  test/               Vitest tests, by module
plugin/                the Claude Code plugin (hooks module) for the Claude desktop app
examples/              sample apps per framework, and the demo site
scripts/               demo GIF and social preview rendering
```

The Claude Code plugin has its own tests: `claude plugin test plugin`. Try it from your checkout with `claude --plugin-dir ./plugin`.

## Adding a framework or a target

- **A framework** needs two things: where an element is written (an attribute added at transform time, or something the framework keeps in development, like Svelte's `__svelte_meta`), and optionally the component chain for the tree. Look at how Vue (`templates.ts`, `vueTree` in `client.ts`) or Svelte (`sourceFromSvelte`, `svelteTree`) do it, add a sample app under `examples/`, and tests with the framework's real output.
- **A target** is an `Opener` in `targets.ts`: a function that gets `{ file, line, column, at }`. Anything that must happen inside the click (the clipboard, opening a URL) belongs in `client.ts` instead.

## Pull requests

- Keep a pull request to one change, with tests for it.
- Before pushing: `pnpm build && pnpm typecheck && pnpm test`.
- If you changed what users see (options, setup, behaviour), update the README.
- Say in the description which framework, editor and browser you tried it with. Claims about a setup we have not run are marked as untested in the README, and that is fine.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `fix: ...`, `feat: ...`, `docs: ...`.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
