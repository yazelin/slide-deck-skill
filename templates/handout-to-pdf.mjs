#!/usr/bin/env node
// handout-to-pdf: 講義 HTML 轉 A4 PDF 工具（支援 Windows / macOS / Linux）
// 用法: node handout-to-pdf.mjs [html-file]

import { dirname, join, resolve, basename, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))

async function loadPlaywright() {
  const candidates = [
    'playwright',
    '/home/ct/.nvm/versions/node/v22.17.1/lib/node_modules/playwright/index.js'
  ]
  for (const c of candidates) {
    try {
      const mod = await import(c)
      return mod.default || mod
    } catch (e) {}
  }
  throw new Error('找不到 playwright 模組。請先執行 npm install playwright')
}

function findChrome() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME
  const platform = process.platform
  let paths = []

  if (platform === 'darwin') {
    paths = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  } else if (platform === 'win32') {
    const local = process.env.LOCALAPPDATA || ''
    const prog = process.env.PROGRAMFILES || ''
    paths = [
      join(local, 'Google/Chrome/Application/chrome.exe'),
      join(prog, 'Google/Chrome/Application/chrome.exe')
    ]
  } else {
    paths = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser']
  }

  for (const p of paths) {
    if (p && existsSync(p)) return p
  }
  return undefined
}

const args = process.argv.slice(2)
let targetHtml = args[0]

if (!targetHtml) {
  const files = readdirSync(here).filter(f => f.endsWith('.html') && (f.includes('講義') || f.includes('handout')))
  targetHtml = files[0] || 'handout.html'
}

const resolvedPath = resolve(here, targetHtml)
if (!existsSync(resolvedPath)) {
  console.error(`❌ 找不到講義檔案: ${resolvedPath}`)
  process.exit(1)
}

const HANDOUT_URL = pathToFileURL(resolvedPath).href
const TARGET_DIR = dirname(resolvedPath)
const BASE_NAME = basename(resolvedPath, extname(resolvedPath))
const OUT_PDF = join(TARGET_DIR, `${BASE_NAME}.pdf`)

console.log(`📄 正在轉換講義: ${resolvedPath} ➔ ${OUT_PDF}`)

const pw = await loadPlaywright()
const chromePath = findChrome()
const b = await pw.chromium.launch(chromePath ? { executablePath: chromePath } : {})
const p = await (await b.newContext({ locale: 'zh-TW' })).newPage()

await p.goto(HANDOUT_URL, { waitUntil: 'load' })
await p.emulateMedia({ media: 'print' })

const pdf = await p.pdf({
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' }
})

writeFileSync(OUT_PDF, pdf)

// 檢查橫向溢出
const over = await p.evaluate(() => {
  const bad = []
  document.querySelectorAll('table, pre, .card').forEach(el => {
    if (el.scrollWidth > el.clientWidth + 2) {
      bad.push(el.tagName + ': ' + el.textContent.trim().slice(0, 24))
    }
  })
  return { bad, docOver: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 }
})

console.log(`✅ 講義 PDF 產生完成（大小: ${(pdf.length / 1024).toFixed(0)} KB）`)
if (over.bad.length || over.docOver) {
  console.warn('⚠️ 警告: 講義存在橫向溢出元素:', over)
} else {
  console.log('✨ 排版檢查無橫向溢出！')
}

await b.close()
