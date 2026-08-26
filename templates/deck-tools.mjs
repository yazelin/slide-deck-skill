#!/usr/bin/env node
// deck-tools: 簡報全套驗證、縮圖產出與 16:9 PDF 匯出工具
// 支援平台: Windows / macOS / Linux
// 用法:
//   node deck-tools.mjs [html-file]           (預設全跑: 驗收 + 產縮圖 + 匯出 PDF)
//   node deck-tools.mjs [html-file] verify    (只跑排版與頁數驗收)
//   node deck-tools.mjs [html-file] thumbs    (只產主控台縮圖)
//   node deck-tools.mjs [html-file] pdf       (只匯出 16:9 PDF)

import { dirname, join, resolve, basename, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))

// 動態解析 Playwright（優先載入專案或全域模組）
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
  throw new Error('找不到 playwright 模組。請先執行 npm install playwright 或 npx playwright install')
}

// 跨平台偵測 Chrome 執行路徑
function findChrome() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME
  const platform = process.platform
  let paths = []

  if (platform === 'darwin') {
    paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ]
  } else if (platform === 'win32') {
    const local = process.env.LOCALAPPDATA || ''
    const prog = process.env.PROGRAMFILES || ''
    const prog86 = process.env['PROGRAMFILES(X86)'] || ''
    paths = [
      join(local, 'Google/Chrome/Application/chrome.exe'),
      join(prog, 'Google/Chrome/Application/chrome.exe'),
      join(prog86, 'Google/Chrome/Application/chrome.exe'),
      join(prog86, 'Microsoft/Edge/Application/msedge.exe')
    ]
  } else {
    paths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    ]
  }

  for (const p of paths) {
    if (p && existsSync(p)) return p
  }
  return undefined // 若未找到則讓 Playwright 使用內建 chromium
}

// 解析目標檔案與指令
const args = process.argv.slice(2)
let targetHtml = null
let command = 'all'

for (const arg of args) {
  if (arg.endsWith('.html')) {
    targetHtml = arg
  } else if (['verify', 'thumbs', 'pdf', 'all'].includes(arg)) {
    command = arg
  }
}

if (!targetHtml) {
  // 自動在目前目錄尋找 .html 簡報
  const files = readdirSync(here).filter(f => f.endsWith('.html') && !f.includes('講義') && !f.includes('handout'))
  targetHtml = files[0] ? join(here, files[0]) : join(here, 'deck.html')
}

const resolvedHtmlPath = resolve(here, targetHtml)
if (!existsSync(resolvedHtmlPath)) {
  console.error(`找不到簡報檔案: ${resolvedHtmlPath}`)
  process.exit(1)
}

const DECK_URL = pathToFileURL(resolvedHtmlPath).href
const TARGET_DIR = dirname(resolvedHtmlPath)
const BASE_NAME = basename(resolvedHtmlPath, extname(resolvedHtmlPath))
const W = 1600, H = 900

console.log(`目標簡報: ${resolvedHtmlPath}`)
console.log(`執行模式: ${command}`)

const pw = await loadPlaywright()
const chromePath = findChrome()
const launchOptions = chromePath ? { executablePath: chromePath } : {}
const b = await pw.chromium.launch(launchOptions)
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  locale: 'zh-TW',
  reducedMotion: 'reduce'
})

const p = await ctx.newPage()
const errs = []
p.on('pageerror', e => errs.push(String(e)))

await p.goto(DECK_URL, { waitUntil: 'load' })

const n = await p.locator('.slide').count()
const notes = await p.locator('#notes > div').count()
console.log(`統計: 共 ${n} 頁投影片, ${notes} 則講者備註`)

if (n !== notes) {
  console.error(`錯誤: 投影片頁數 (${n}) 與備註數 (${notes}) 不相符。請確認每頁 .slide 都有對應的 <div> 備註。`)
  await b.close()
  process.exit(1)
}

// 逐頁翻頁驗收與截圖
const shots = []
await p.keyboard.press('Home')
await p.waitForTimeout(300)

for (let i = 1; i <= n; i++) {
  if (i > 1) {
    await p.keyboard.press('ArrowRight')
  }
  await p.waitForTimeout(400)

  // 驗證計數器
  const at = await p.evaluate(() => document.getElementById('counter')?.textContent?.trim() || '')
  if (at && at !== `${i} / ${n}`) {
    console.error(`第 ${i} 頁翻頁失敗，計數器顯示: ${at}`)
    await b.close()
    process.exit(1)
  }

  // 驗證 active 數量
  const activeCount = await p.locator('.slide.active').count()
  if (activeCount !== 1) {
    console.error(`第 ${i} 頁 active 狀態異常 (active=${activeCount})`)
    await b.close()
    process.exit(1)
  }

  // 檢查排版是否溢出 (Overflow check)
  const over = await p.evaluate(() => {
    const s = document.querySelector('.slide.active')
    if (!s) return { h: false, w: false }
    return {
      h: s.scrollHeight > s.clientHeight + 4,
      w: s.scrollWidth > s.clientWidth + 4
    }
  })

  if (over.h || over.w) {
    console.warn(`警告: 第 ${i} 頁內容超出可視範圍 (溢出: ${JSON.stringify(over)})`)
  }

  if (command !== 'verify') {
    shots.push(await p.screenshot({ animations: 'disabled', type: 'jpeg', quality: 88 }))
  }
}

if (errs.length > 0) {
  console.error('JS 執行錯誤:', errs)
  await b.close()
  process.exit(1)
}

console.log('OK: 逐頁結構與翻頁驗收通過。')

// 產出縮圖
if (command === 'all' || command === 'thumbs') {
  const thumbDir = join(TARGET_DIR, 'assets/thumbs')
  mkdirSync(thumbDir, { recursive: true })
  
  const tp = await ctx.newPage()
  for (let i = 0; i < n; i++) {
    await tp.setContent(`<img src="data:image/jpeg;base64,${shots[i].toString('base64')}" style="width:320px;display:block">`)
    const el = await tp.locator('img')
    const outPath = join(thumbDir, `t${i + 1}.webp`)
    await el.screenshot({ path: outPath }).catch(async () => {
      await el.screenshot({ path: join(thumbDir, `t${i + 1}.jpg`), type: 'jpeg' })
    })
  }
  await tp.close()
  console.log(`縮圖: ${n} 張已生成 -> assets/thumbs/`)
}

// 匯出 16:9 PDF
if (command === 'all' || command === 'pdf') {
  const pdfPage = await ctx.newPage()
  const imgs = shots.map(s => `<img src="data:image/jpeg;base64,${s.toString('base64')}">`).join('')
  await pdfPage.setContent(`
    <style>
      @page { size: ${W}px ${H}px; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      img { width: ${W}px; height: ${H}px; display: block; page-break-after: always; }
    </style>
    ${imgs}
  `)
  const outPdfPath = join(TARGET_DIR, `${BASE_NAME}.pdf`)
  const pdfBuffer = await pdfPage.pdf({
    width: `${W}px`,
    height: `${H}px`,
    printBackground: true,
    pageRanges: `1-${n}`
  })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(outPdfPath, pdfBuffer)
  console.log(`PDF: 16:9 投影片 PDF 匯出完成 -> ${outPdfPath}`)
}

await b.close()
console.log('完成。')

