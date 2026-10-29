import { parseArgs } from 'node:util'
import type { EditorWindow } from './editor'
import { DEFAULT_STANDALONE_PORT, startStandaloneServer } from './standalone'
import type { OpenTarget } from './targets'

const HELP = `Usage: claude-locator [options]

Serves the open endpoint for dev servers that take no Vite plugin (Angular CLI, webpack, Next.js).
Load the page script with: import('vite-plugin-claude-locator/client').then((m) => m.startClaudeLocator())

Options:
  --open <targets>        claude,editor,opencode (default: claude)
  --editor <name>         editor launcher for the editor target: cursor, code, zed, ...
  --editor-window <mode>  reuse (default) or project
  --opencode-url <url>    OpenCode server (default: http://127.0.0.1:4096)
  --format <template>     how opencode writes the location (default: {path}:{line})
  --root <dir>            the app's folder (default: the current folder)
  --port <n>              default: ${DEFAULT_STANDALONE_PORT}
  -h, --help
`

const { values } = parseArgs({
  options: {
    open: { type: 'string' },
    editor: { type: 'string' },
    'editor-window': { type: 'string' },
    'opencode-url': { type: 'string' },
    format: { type: 'string' },
    root: { type: 'string' },
    port: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  process.stdout.write(HELP)
  process.exit(0)
}

startStandaloneServer({
  open: (values.open ?? 'claude').split(',').filter(Boolean) as OpenTarget[],
  editor: values.editor,
  editorWindow: values['editor-window'] as EditorWindow | undefined,
  opencodeUrl: values['opencode-url'],
  locationFormat: values.format,
  root: values.root,
  port: values.port ? Number(values.port) : undefined,
}).then(
  ({ url }) => console.log(`[claude-locator] listening on ${url}`),
  (error: unknown) => {
    console.error(`[claude-locator] ${String(error)}`)
    process.exit(1)
  },
)
