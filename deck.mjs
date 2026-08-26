#!/usr/bin/env node
// slide-deck: 跨平台 HTML 簡報與講義骨架產生與管理 CLI
// 支援平台: Windows / macOS / Linux

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const templatesDir = join(here, 'templates')

const [cmd, targetDir, ...options] = process.argv.slice(2)

function usage() {
  console.log(`
🎬 slide-deck CLI — 專業 16:9 網頁簡報與講義工具 (跨平台支援)

用法:
  node deck.mjs init <專案路徑> [--title "標題"]   初始化新簡報與講義專案
  node deck.mjs verify [簡報路徑]                   排版與頁數結構檢查
  node deck.mjs export [簡報路徑]                   全自動產出縮圖 + 匯出 16:9 PDF
  node deck.mjs handout [講義路徑]                  匯出學員講義 A4 PDF
  node deck.mjs serve [專案路徑]                    啟動本地預覽伺服器

範例:
  node deck.mjs init my-talk --title "AI Agent 架構實戰"
  cd my-talk && node deck-tools.mjs
`)
}

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  usage()
  process.exit(0)
}

if (cmd === 'init') {
  if (!targetDir) {
    console.error('❌ 請指定專案目錄路徑，例如: node deck.mjs init ./my-deck')
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
  const files = ['deck.css', 'deck-tools.mjs', 'handout.html', 'handout-to-pdf.mjs']
  for (const f of files) {
    copyFileSync(join(templatesDir, f), join(dest, f))
  }

  // 替換標題後寫入 deck.html
  let deckHtml = readFileSync(join(templatesDir, 'deck.html'), 'utf8')
  deckHtml = deckHtml.replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
  deckHtml = deckHtml.replace(/<h1>.*?<\/h1>/s, `<h1>${title}</h1>`)
  writeFileSync(join(dest, 'deck.html'), deckHtml)

  console.log(`
🎉 簡報專案已建立在: ${dest}
📄 檔案結構:
  ├── deck.html           (投影片主檔，瀏覽器直接開或雙擊即播)
  ├── deck.css            (響應式 16:9 樣式庫)
  ├── deck-tools.mjs      (自動化驗收、縮圖與 16:9 PDF 匯出)
  ├── handout.html        (學員講義版型)
  ├── handout-to-pdf.mjs  (講義 A4 PDF 匯出工具)
  └── assets/thumbs/      (主控台縮圖目錄)

🚀 快速開始:
  cd ${targetDir}
  # 直接用瀏覽器開啟 deck.html 播放（按 P 鍵開啟講者主控台）
  # 跑自動驗收與 PDF 匯出: node deck-tools.mjs
`)
  process.exit(0)
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
  console.error(`❌ 未知指令: ${cmd}`)
  usage()
  process.exit(1)
}
