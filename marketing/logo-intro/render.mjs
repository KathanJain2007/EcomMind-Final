// Renders scene.html frame by frame through headless Chrome over raw CDP.
// usage: node render.mjs <framesDir> [--landscape] [--fps 60] [--times 0.5,1.2] [--chrome /path]
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const framesDir = resolve(args[0])
const fps = Number(flag('fps', 60))
const onlyTimes = flag('times')?.split(',').map(Number)
const chrome = flag('chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
const here = dirname(fileURLToPath(import.meta.url))
const landscape = args.includes('--landscape')
const [width, height] = landscape ? [1920, 1080] : [1080, 1920]
const sceneUrl = pathToFileURL(join(here, 'scene.html')).href + (landscape ? '?render&landscape' : '?render')

mkdirSync(framesDir, { recursive: true })
const profile = mkdtempSync(join(tmpdir(), 'logo-intro-chrome-'))
const browser = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--allow-file-access-from-files', '--force-color-profile=srgb', '--force-device-scale-factor=1',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] })

const wsUrl = await new Promise((res, rej) => {
  let log = ''
  browser.stderr.on('data', d => {
    log += d
    const m = log.match(/DevTools listening on (ws:\S+)/)
    if (m) res(m[1])
  })
  browser.on('exit', c => rej(new Error(`Chrome exited (${c}): ${log}`)))
})

const ws = new WebSocket(wsUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let nextId = 1
const pending = new Map()
ws.onmessage = ev => {
  const m = JSON.parse(ev.data)
  if (!m.id) return
  const p = pending.get(m.id)
  pending.delete(m.id)
  m.error ? p.rej(new Error(m.error.message)) : p.res(m.result)
}
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = nextId++
  pending.set(id, { res, rej })
  ws.send(JSON.stringify({ id, method, params, sessionId }))
})

let failed = false
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const cmd = (m, p) => send(m, p, sessionId)
  await cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await cmd('Page.enable')
  await cmd('Page.navigate', { url: sceneUrl })
  const evaluate = async expression => {
    const r = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  for (let i = 0; i < 100; i++) {
    if (await evaluate('document.readyState === "complete" && typeof window.sceneReady !== "undefined"')) break
    await new Promise(r => setTimeout(r, 100))
  }
  await evaluate('window.sceneReady.then(() => true)')

  // Sampled direction check for the brief's critical beat.
  const probes = []
  for (let t = 1.75; t <= 2.25; t += 1 / fps) probes.push(await evaluate(`window.probe(${t})`))
  for (let i = 1; i < probes.length; i++) {
    if (probes[i].cart < probes[i - 1].cart) throw new Error('cart moved left during separation')
    probes[i].lines.forEach((x, k) => {
      if (x > probes[i - 1].lines[k]) throw new Error('a motion line moved right during separation')
    })
  }
  writeFileSync(join(framesDir, 'direction-check.json'), JSON.stringify(probes[probes.length - 1]))

  const total = Math.round(5 * fps)
  const times = onlyTimes ?? Array.from({ length: total }, (_, i) => i / fps)
  for (let i = 0; i < times.length; i++) {
    const t = times[i]
    await evaluate(`renderAt(${t}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`)
    const { data } = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const name = onlyTimes ? `t${t.toFixed(3)}.png` : `f${String(i).padStart(4, '0')}.png`
    writeFileSync(join(framesDir, name), Buffer.from(data, 'base64'))
    if (i % 60 === 59) console.log(`frame ${i + 1}/${times.length}`)
  }
  console.log(`rendered ${times.length} frames to ${framesDir}`)
} catch (e) {
  console.error(e)
  failed = true
} finally {
  ws.close()
  browser.kill()
  await new Promise(r => setTimeout(r, 300))
  rmSync(profile, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
