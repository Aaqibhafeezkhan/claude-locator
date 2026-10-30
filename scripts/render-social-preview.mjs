#!/usr/bin/env node
// Renders scripts/social-preview.html to docs/social-preview.png (2560×1280) with headless Chrome.
// Upload the PNG in the repository's Settings → Social preview; GitHub's API cannot set it.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const out = path.join(root, 'docs/social-preview.png')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-locator-og-'))

const result = spawnSync(chrome, [
  '--headless=new',
  '--hide-scrollbars',
  '--allow-file-access-from-files',
  `--user-data-dir=${profile}`,
  '--window-size=1280,640',
  '--force-device-scale-factor=2',
  '--virtual-time-budget=4000',
  `--screenshot=${out}`,
  pathToFileURL(path.join(root, 'scripts/social-preview.html')).href,
])
fs.rmSync(profile, { recursive: true, force: true })
if (result.status !== 0 || !fs.existsSync(out)) {
  console.error(String(result.stderr))
  process.exit(1)
}
console.log(`${out}: ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`)
