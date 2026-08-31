#!/usr/bin/env node
// 煙霧測試:確認 CLI 本身載得進去、init 真的產得出骨架。
// 起因:2026-08-26 加 serve 指令時混進頂層 return,整個 deck.mjs 載不進去,
//       init/serve/verify 全死了三天沒人發現 —— 因為只驗簡報,沒驗工具自己。
//   node scripts/smoke.mjs
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const node = process.execPath
let bad = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) bad++ }

// 1. 三支腳本語法都要過(這一條就擋得住那個頂層 return)
for (const f of ['deck.mjs', 'templates/deck-tools.mjs', 'templates/handout-to-pdf.mjs']) {
  let ok = true
  try { execFileSync(node, ['--check', join(root, f)], { stdio: 'pipe' }) } catch { ok = false }
  check(ok, `${f} 語法`)
}

// 1b. 同一顆按鈕可能同時掛 data-load 與 data-max,用 btn.onclick 會互相覆蓋(後者贏),
//     結果是按了只切滿版、iframe 從沒建出來。模板一律用 addEventListener。
{
  const html = readFileSync(join(root, 'templates', 'deck.html'), 'utf-8')
  check(!/btn\.onclick\s*=/.test(html), 'deck.html 沒有用 btn.onclick(會覆蓋同顆按鈕的另一個處理器)')
}

// 2. init 真的要產得出骨架
const tmp = mkdtempSync(join(tmpdir(), 'deck-smoke-'))
const out = join(tmp, 'deck')
try {
  execFileSync(node, [join(root, 'deck.mjs'), 'init', out, '--title', 'smoke'], { stdio: 'pipe' })
} catch (e) { check(false, `init 執行(${e.status})`) }
for (const f of ['deck.html', 'deck.css', 'deck-tools.mjs', 'handout.html', 'handout-to-pdf.mjs', 'qrcode.min.js']) {
  check(existsSync(join(out, f)), `init 產出 ${f}`)
}
// 2b. deck-tools 要找得到 playwright(裝在專案或全域都算)。裝了才驗,沒裝就跳過。
{
  let hasPw = false
  try { execFileSync(node, ['-e', "import('playwright')"], { stdio: 'pipe' }); hasPw = true } catch {}
  if (!hasPw) {
    try {
      const groot = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'],
                                 { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      hasPw = existsSync(join(groot, 'playwright', 'index.js'))
    } catch {}
  }
  if (!hasPw) console.log('skip 本機沒裝 playwright,跳過 deck-tools 驗收')
  else {
    let ok = true
    try {
      execFileSync(node, [join(out, 'deck-tools.mjs'), join(out, 'deck.html'), 'verify'], { stdio: 'pipe', timeout: 120000 })
    } catch (e) { ok = false }
    check(ok, 'deck-tools verify 跑得起來(找得到 playwright 與瀏覽器)')
  }
}

rmSync(tmp, { recursive: true, force: true })

// 3. 離線 serve:遙控頁真的送得出來,而且投影機端與手機端真的互通
//    (2026-08-26 那版 /remote 是 404,而且伺服器講 SSE、簡報講 WebSocket,協定對不上)
const port = 8300 + Math.floor(Math.random() * 400)
const tmp2 = mkdtempSync(join(tmpdir(), 'deck-serve-'))
execFileSync(node, [join(root, 'deck.mjs'), 'init', join(tmp2, 'd'), '--title', 'smoke'], { stdio: 'pipe' })
const srv = spawn(node, [join(root, 'deck.mjs'), 'serve', String(port), join(tmp2, 'd')], { stdio: 'pipe' })
const base = `http://127.0.0.1:${port}`
const sleep = ms => new Promise(r => setTimeout(r, ms))

try {
  for (let i = 0; i < 40; i++) {
    try { await fetch(base + '/state?room=smoke'); break } catch { await sleep(100) }
  }

  const r1 = await fetch(base + '/remote?room=smoke')
  const html = await r1.text()
  check(r1.status === 200, `/remote 回 200 (實際 ${r1.status})`)
  check(html.includes('簡報手機遙控器'), '/remote 內容是遙控面板')

  const st = await (await fetch(base + '/state?room=smoke')).json()
  check(st.active === true, '/state 回房間狀態')

  // 投影機端連上並送一次狀態
  const host = new WebSocket(`ws://127.0.0.1:${port}/ws?room=smoke&role=host&pin=1234`)
  await new Promise((ok, no) => { host.onopen = ok; host.onerror = () => no(new Error('host 連不上')) })
  check(true, 'WebSocket 握手成功')
  host.send(JSON.stringify({ type: 'state', page: 7 }))
  await sleep(120)

  // 手機端後連,應該立刻收到最後狀態
  const phone = new WebSocket(`ws://127.0.0.1:${port}/ws?room=smoke&role=remote&pin=1234`)
  const first = await new Promise((ok, no) => {
    phone.onmessage = e => ok(JSON.parse(e.data))
    phone.onerror = () => no(new Error('phone 連不上'))
    setTimeout(() => no(new Error('等不到最後狀態')), 3000)
  }).catch(e => ({ error: e.message }))
  check(first.page === 7, `後連的手機收到最後狀態 (收到 ${JSON.stringify(first)})`)

  // 手機按下一頁,投影機端要收到
  const relayed = await new Promise(ok => {
    host.onmessage = e => ok(e.data)
    setTimeout(() => ok(null), 3000)
    phone.send(JSON.stringify('next'))
  })
  check(relayed === JSON.stringify('next'), `手機指令轉到投影機端 (收到 ${relayed})`)

  // 錯的 pin 要被擋掉
  const badPin = new WebSocket(`ws://127.0.0.1:${port}/ws?room=smoke&role=remote&pin=9999`)
  const rejected = await new Promise(ok => {
    badPin.onopen = () => ok(false); badPin.onerror = () => ok(true); setTimeout(() => ok(false), 2000)
  })
  check(rejected, '錯的配對密碼被擋下')

  host.close(); phone.close()
} catch (e) {
  check(false, `離線 serve 測試爆掉: ${e.message}`)
} finally {
  srv.kill('SIGTERM')
  rmSync(tmp2, { recursive: true, force: true })
}

console.log(bad ? `\n${bad} 項失敗` : '\n全過')
process.exit(bad ? 1 : 0)
