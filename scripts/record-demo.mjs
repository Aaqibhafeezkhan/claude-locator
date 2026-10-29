#!/usr/bin/env node
// Records the README GIF from the demo site: headless Chrome driven over the DevTools protocol, frames taken at a
// fixed rate, then ffmpeg. Needs Chrome and ffmpeg, and the demo served first:
//   pnpm build && pnpm --filter example-demo build && pnpm --filter example-demo preview --port 5131
//   node scripts/record-demo.mjs [url] [out.gif]
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const url = process.argv[2] ?? 'http://localhost:5131/'
const out = path.resolve(process.argv[3] ?? 'docs/demo.gif')
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const width = 1100
const height = 640
const fps = 12

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-locator-record-'))
const frames = path.join(profile, 'frames')
fs.mkdirSync(frames)

const browser = spawn(chrome, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`,
  '--hide-scrollbars',
  'about:blank',
])
const wsUrl = await new Promise((resolve, reject) => {
  browser.stderr.on('data', (chunk) => {
    const match = /DevTools listening on (ws:\/\/\S+)/.exec(String(chunk))
    if (match) resolve(match[1])
  })
  browser.once('exit', () => reject(new Error('Chrome exited')))
})

// One page target, spoken to over the browser socket with a session id
const socket = new WebSocket(wsUrl)
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
let nextId = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
  }
})
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)))
    socket.send(JSON.stringify({ id, method, params, sessionId }))
  })

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
const page = (method, params) => send(method, params, sessionId)
await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
await page('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
await page('Page.enable')
await page('Page.navigate', { url })
await new Promise((resolve) => setTimeout(resolve, 1500))

const evaluate = async (expression) =>
  (await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value

// A drawn cursor and an Option key badge: synthetic events move nothing on screen by themselves
await evaluate(`(() => {
  const cursor = document.createElement('div')
  cursor.id = 'rec-cursor'
  cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>'
  cursor.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transition:none'
  const key = document.createElement('div')
  key.id = 'rec-key'
  key.textContent = '⌥ Option'
  key.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;padding:6px 12px;border-radius:8px;font:600 15px system-ui;background:#d97757;color:#fff;display:none'
  document.body.append(cursor, key)
  window.open = () => null
  window.scrollTo(0, 230)
})()`)

let frame = 0
const capture = async () => {
  const { data } = await page('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(frames, `${String(frame++).padStart(4, '0')}.png`), Buffer.from(data, 'base64'))
}
const hold = async (ms) => {
  for (let i = 0; i < Math.round((ms / 1000) * fps); i += 1) await capture()
}

const center = (selector, index = 0) =>
  evaluate(`(() => {
    const element = document.querySelectorAll(${JSON.stringify(selector)})[${index}]
    const rect = element.getBoundingClientRect()
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
  })()`)

let position = { x: 980, y: 600 }
const setKey = (isDown) => evaluate(`document.getElementById('rec-key').style.display = ${isDown ? "'block'" : "'none'"}`)
// Moves the drawn cursor and sends the events the page reacts to, with the modifier held
const moveTo = async (target, ms = 700) => {
  const steps = Math.max(1, Math.round((ms / 1000) * fps))
  const from = position
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps
    const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
    position = { x: from.x + (target.x - from.x) * ease, y: from.y + (target.y - from.y) * ease }
    await evaluate(`(() => {
      document.getElementById('rec-cursor').style.transform = 'translate(${position.x}px, ${position.y}px)'
      const target = document.elementFromPoint(${position.x}, ${position.y})
      const alt = document.getElementById('rec-key').style.display === 'block'
      target && target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: ${position.x}, clientY: ${position.y}, altKey: alt }))
    })()`)
    await capture()
  }
}
const fire = (type, extra = '') =>
  evaluate(`(() => {
    const target = document.elementFromPoint(${position.x}, ${position.y})
    target && target.dispatchEvent(new MouseEvent('${type}', { bubbles: true, cancelable: true, clientX: ${position.x}, clientY: ${position.y}, altKey: true ${extra} }))
  })()`)

await hold(600)
await setKey(true)
await moveTo(await center('.card .button', 1), 900)
await hold(900)
await fire('click', ', button: 0')
await hold(1400)
await moveTo(await center('.counter .button'), 700)
await hold(700)
await fire('click', ', button: 0')
await hold(1200)
await moveTo(await center('.card h3', 2), 700)
await hold(900)
await fire('contextmenu', ', button: 2')
await hold(2200)
await setKey(false)
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
await hold(600)

browser.kill()
const palette = path.join(profile, 'palette.png')
const filters = `fps=${fps},scale=880:-1:flags=lanczos`
const run = (args) => {
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run(['-framerate', String(fps), '-i', path.join(frames, '%04d.png'), '-vf', `${filters},palettegen=max_colors=96`, palette])
run([
  '-framerate', String(fps), '-i', path.join(frames, '%04d.png'), '-i', palette,
  '-lavfi', `${filters} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=4`, out,
])
fs.rmSync(profile, { recursive: true, force: true })
console.log(`${out}: ${frame} frames, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`)
