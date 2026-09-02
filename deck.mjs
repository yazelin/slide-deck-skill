#!/usr/bin/env node
// slide-deck: 跨平台 HTML 簡報與講義骨架產生與管理 CLI
// 支援平台: Windows / macOS / Linux / 100% 離線同區網同步

import { dirname, join, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, statSync, createReadStream, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { networkInterfaces } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const templatesDir = join(here, 'templates')

const [cmd, targetDir, ...options] = process.argv.slice(2)

function usage() {
  console.log(`
slide-deck CLI — 專業 16:9 網頁簡報與講義工具 (跨平台與 100% 離線支援)

用法:
  node deck.mjs init <專案路徑> [--title "標題"]   初始化新簡報與講義專案
  node deck.mjs serve [port] [目錄]                啟動 100% 離線區域網路同步伺服器
  node deck.mjs verify [簡報路徑]                   排版與頁數結構檢查
  node deck.mjs export [簡報路徑]                   全自動產出縮圖 + 匯出 16:9 PDF
  node deck.mjs handout [講義路徑]                  匯出學員講義 A4 PDF

範例:
  node deck.mjs init my-talk --title "AI Agent 架構實戰"
  node deck.mjs serve 8080 ./my-talk
`)
}

function getLanIp() {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('172.') && !net.address.startsWith('127.')) {
        return net.address
      }
    }
  }
  return '127.0.0.1'
}

// 使用者給的路徑是相對於他的 cwd,但 deck-tools.mjs 與 handout-to-pdf.mjs 都是
// resolve(自己所在的目錄, 參數),而且 deck-tools 只認 .html 結尾的參數。
// 直接把資料夾名往下傳,它會安靜地改去驗 templates/deck.html 然後回報 OK,
// 還會把 deck.pdf 跟 assets/ 寫進 templates/。所以這裡一律轉成絕對的 .html 路徑。
function pickHtml (p, kind) {
  if (!p) return []
  const abs = resolve(process.cwd(), p)
  if (!existsSync(abs)) {
    console.error(`找不到: ${abs}`)
    process.exit(1)
  }
  if (statSync(abs).isFile()) return [abs]
  const isHandout = f => f.includes('講義') || f.includes('handout')
  const hit = readdirSync(abs)
    .filter(f => f.endsWith('.html'))
    .filter(f => kind === 'handout' ? isHandout(f) : !isHandout(f))
  if (!hit.length) {
    console.error(`${abs} 裡找不到${kind === 'handout' ? '講義' : '簡報'}的 .html`)
    process.exit(1)
  }
  return [join(abs, hit[0])]
}

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  usage()
  process.exit(0)
}

if (cmd === 'init') {
  if (!targetDir) {
    console.error('請指定專案目錄路徑，例如: node deck.mjs init ./my-deck')
    process.exit(1)
  }

  const dest = resolve(process.cwd(), targetDir)
  let title = '投影片標題'
  const titleIdx = options.indexOf('--title')
  if (titleIdx > -1 && options[titleIdx + 1]) {
    title = options[titleIdx + 1]
  }

  mkdirSync(dest, { recursive: true })
  mkdirSync(join(dest, 'assets'), { recursive: true })
  mkdirSync(join(dest, 'assets/thumbs'), { recursive: true })

  // 複製樣板檔案
  const files = ['deck.css', 'deck-tools.mjs', 'handout.html', 'handout-to-pdf.mjs', 'qrcode.min.js']
  for (const f of files) {
    const src = join(templatesDir, f)
    if (existsSync(src)) copyFileSync(src, join(dest, f))
  }

  // 替換標題後寫入 deck.html
  let deckHtml = readFileSync(join(templatesDir, 'deck.html'), 'utf8')
  deckHtml = deckHtml.replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
  deckHtml = deckHtml.replace(/<h1>.*?<\/h1>/s, `<h1>${title}</h1>`)
  writeFileSync(join(dest, 'deck.html'), deckHtml)

  console.log(`
簡報專案已建立在: ${dest}
檔案結構:
  ├── deck.html           (投影片主檔，瀏覽器直接開或雙擊即播)
  ├── deck.css            (響應式 16:9 樣式庫)
  ├── qrcode.min.js       (純前端離線 QR Code 產生器)
  ├── deck-tools.mjs      (自動化驗收、縮圖與 16:9 PDF 匯出)
  ├── handout.html        (學員講義版型)
  ├── handout-to-pdf.mjs  (講義 A4 PDF 匯出工具)
  └── assets/thumbs/      (主控台縮圖目錄)

快速開始:
  cd ${targetDir}
  # 有外網或雙螢幕：直接用瀏覽器開 deck.html 播放
  # 沒外網純同區網：node ${join(here, 'deck.mjs')} serve 8080 .
`)
  process.exit(0)
}

if (cmd === 'serve') {
  const port = parseInt(targetDir, 10) || 8080
  const serveDir = resolve(process.cwd(), options[0] || (isNaN(parseInt(targetDir, 10)) ? targetDir : '.'))
  const lanIp = getLanIp()

  // 遙控面板頁面直接從 worker 原始碼抽出來,線上與離線永遠是同一份 UI。
  // ponytail: 字串切割而非 build step。哪天 worker 改成 import .html,這裡換成 readFileSync 即可。
  function remoteHtml() {
    const MARK = 'const REMOTE_HTML = `'
    try {
      const src = readFileSync(join(here, 'worker', 'src', 'index.ts'), 'utf-8')
      const from = src.indexOf(MARK)
      if (from < 0) return null
      const body = src.slice(from + MARK.length)
      const stop = body.indexOf('`')
      if (stop < 0 || stop < 200) return null
      return body.slice(0, stop)
    } catch (e) { return null }
  }

  // 房間:跟 worker 的 Durable Object 同語意 —— 存最後狀態 + 廣播給同房其他連線
  const rooms = new Map()
  const roomOf = id => {
    if (!rooms.has(id)) rooms.set(id, { pin: null, lastState: null, sockets: new Set() })
    return rooms.get(id)
  }

  const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

  function wsSend(sock, text) {
    const payload = Buffer.from(text, 'utf-8')
    const n = payload.length
    let head
    if (n < 126) head = Buffer.from([0x81, n])
    else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(n, 2) }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2) }
    try { sock.write(Buffer.concat([head, payload])) } catch (e) {}
  }

  function broadcast(room, from, text) {
    try { const d = JSON.parse(text); if (d && d.type === 'state') room.lastState = d } catch (e) {}
    for (const s of room.sockets) if (s !== from) wsSend(s, text)
  }

  function handleUpgrade(req, sock) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const key = req.headers['sec-websocket-key']
    const roomId = url.searchParams.get('room')
    if (url.pathname !== '/ws' || !key || !roomId) {
      try { sock.write('HTTP/1.1 400 Bad Request\r\n\r\n') } catch (e) {}
      return sock.destroy()
    }
    const room = roomOf(roomId)
    const pin = url.searchParams.get('pin')
    if (!room.pin && pin) room.pin = pin
    else if (room.pin && pin && room.pin !== pin) {
      try { sock.write('HTTP/1.1 403 Forbidden\r\n\r\n') } catch (e) {}
      return sock.destroy()
    }

    const accept = createHash('sha1').update(key + WS_GUID).digest('base64')
    sock.write('HTTP/1.1 101 Switching Protocols\r\n' +
               'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
               `Sec-WebSocket-Accept: ${accept}\r\n\r\n`)
    sock.setNoDelay(true)
    room.sockets.add(sock)
    if (room.lastState) wsSend(sock, JSON.stringify(room.lastState))

    const drop = () => { room.sockets.delete(sock); try { sock.destroy() } catch (e) {} }
    sock.on('error', drop)
    sock.on('close', () => room.sockets.delete(sock))

    let buf = Buffer.alloc(0)
    let frag = Buffer.alloc(0)
    sock.on('data', chunk => {
      buf = Buffer.concat([buf, chunk])
      for (;;) {
        if (buf.length < 2) return
        const b0 = buf[0], b1 = buf[1]
        const opcode = b0 & 0x0f
        const masked = (b1 & 0x80) !== 0
        let len = b1 & 0x7f
        let off = 2
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4 }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10 }
        const need = off + (masked ? 4 : 0) + len
        if (buf.length < need) return
        let payload = Buffer.from(buf.subarray(off + (masked ? 4 : 0), need))
        if (masked) {
          const mask = buf.subarray(off, off + 4)
          for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]
        }
        buf = buf.subarray(need)
        if (opcode === 0x8) return drop()
        if (opcode === 0x9) { try { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])) } catch (e) {}; continue }
        if (opcode === 0xa) continue
        frag = Buffer.concat([frag, payload])
        if (!(b0 & 0x80)) continue   // FIN=0,訊息還沒完
        const text = frag.toString('utf-8')
        frag = Buffer.alloc(0)
        broadcast(room, sock, text)
      }
    })
  }

  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf'
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')
    if (req.method === 'OPTIONS') return res.writeHead(204).end()

    // 手機遙控面板(跟 worker 同一份 HTML)
    if (url.pathname === '/remote' || url.pathname === '/remote.html') {
      const html = remoteHtml()
      if (!html) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end('抽不到遙控頁:找不到 worker/src/index.ts 裡的 REMOTE_HTML')
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(html)
    }

    // 房間狀態(遙控頁連線前會問)
    if (url.pathname === '/state') {
      const id = url.searchParams.get('room')
      if (!id) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end('{"error":"missing_room"}') }
      const r = roomOf(id)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ active: true, has_pin: !!r.pin, last_state: r.lastState }))
    }

    // 靜態檔案服務
    let filePath = join(serveDir, url.pathname === '/' ? 'deck.html' : url.pathname)
    if (!existsSync(filePath) && existsSync(join(templatesDir, url.pathname))) {
      filePath = join(templatesDir, url.pathname)
    }

    if (existsSync(filePath) && statSync(filePath).isFile()) {
      const ext = extname(filePath)
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' })
      createReadStream(filePath).pipe(res)
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('404 Not Found')
    }
  })

  server.on('upgrade', handleUpgrade)

  server.listen(port, '0.0.0.0', () => {
    console.log(`
離線區域網路簡報伺服器已啟動
--------------------------------------------------
簡報請用這個網址開： http://${lanIp}:${port}/deck.html
（用 localhost 開的話,手機遙控 QR 會指到 localhost,手機連不到）
手機遙控：簡報按 P 開主控台 → 手機遙控 → 手機掃 QR
--------------------------------------------------
手機連同一個 Wi-Fi,或連這台電腦開的熱點即可。Ctrl+C 結束。
`)
  })
} else if (cmd === 'verify' || cmd === 'export' || cmd === 'thumbs' || cmd === 'pdf') {
  const scriptPath = join(templatesDir, 'deck-tools.mjs')
  const child = spawn(process.execPath, [scriptPath, ...pickHtml(targetDir, 'deck'), cmd === 'export' ? 'all' : cmd], {
    stdio: 'inherit'
  })
  child.on('exit', code => process.exit(code || 0))
} else if (cmd === 'handout') {
  const scriptPath = join(templatesDir, 'handout-to-pdf.mjs')
  const child = spawn(process.execPath, [scriptPath, ...pickHtml(targetDir, 'handout')], {
    stdio: 'inherit'
  })
  child.on('exit', code => process.exit(code || 0))
} else {
  console.error(`未知指令: ${cmd}`)
  usage()
  process.exit(1)
}
