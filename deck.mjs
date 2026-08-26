#!/usr/bin/env node
// slide-deck: 跨平台 HTML 簡報與講義骨架產生與管理 CLI
// 支援平台: Windows / macOS / Linux / 100% 離線同區網同步

import { dirname, join, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, statSync, createReadStream } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
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
  # 沒外網純同區網：node /home/ct/slide-deck-skill/deck.mjs serve 8080 .
`)
  process.exit(0)
}

if (cmd === 'serve') {
  const port = parseInt(targetDir, 10) || 8080
  const serveDir = resolve(process.cwd(), options[0] || (isNaN(parseInt(targetDir, 10)) ? targetDir : '.'))
  const lanIp = getLanIp()

  // 房間與 SSE 連線管理
  const rooms = new Map()

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

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')
    if (req.method === 'OPTIONS') return res.writeHead(204).end()

    // 離線 SSE 事件流 /events?room=...
    if (url.pathname === '/events') {
      const room = url.searchParams.get('room') || 'default'
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      })
      res.write(': connected\n\n')

      if (!rooms.has(room)) rooms.set(room, new Set())
      const clients = rooms.get(room)
      clients.add(res)

      req.on('close', () => {
        clients.delete(res)
        if (clients.size === 0) rooms.delete(room)
      })
      return
    }

    // 離線指令發送 /api/send
    if (url.pathname === '/api/send' && req.method === 'POST') {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        try {
          const data = JSON.parse(body)
          const room = data.room || url.searchParams.get('room') || 'default'
          const clients = rooms.get(room)
          if (clients) {
            const payload = `data: ${JSON.stringify(data)}\n\n`
            for (const client of clients) {
              try { client.write(payload) } catch (e) {}
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          res.writeHead(400).end('Bad Request')
        }
      })
      return
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

  server.listen(port, '0.0.0.0', () => {
    console.log(`
離線區域網路簡報伺服器已啟動
--------------------------------------------------
電腦投影／主控台： http://localhost:${port}/deck.html
同區網手機遙控：  http://${lanIp}:${port}/remote?room=demo
--------------------------------------------------
（手機連同一個 Wi-Fi 或連電腦開的熱點即可連線遙控）
`)
  })
  return
}

if (cmd === 'verify' || cmd === 'export' || cmd === 'thumbs' || cmd === 'pdf') {
  const target = targetDir || 'deck-tools.mjs'
  const scriptPath = target.endsWith('.mjs') ? resolve(process.cwd(), target) : join(templatesDir, 'deck-tools.mjs')
  const child = spawn(process.execPath, [scriptPath, ...(targetDir ? [targetDir] : []), cmd === 'export' ? 'all' : cmd], {
    stdio: 'inherit'
  })
  child.on('exit', code => process.exit(code || 0))
} else if (cmd === 'handout') {
  const scriptPath = join(templatesDir, 'handout-to-pdf.mjs')
  const child = spawn(process.execPath, [scriptPath, ...(targetDir ? [targetDir] : [])], {
    stdio: 'inherit'
  })
  child.on('exit', code => process.exit(code || 0))
} else {
  console.error(`未知指令: ${cmd}`)
  usage()
  process.exit(1)
}
