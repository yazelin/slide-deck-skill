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
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))

// 動態解析 Playwright（優先載入專案或全域模組）
async function loadPlaywright() {
  const tries = ['playwright']
  // 專案本地找不到就問 npm 全域安裝位置(跨機器可攜,不寫死任何人的家目錄)
  try {
    const { execFileSync } = await import('node:child_process')
    const root = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'],
                              { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (root) tries.push(pathToFileURL(join(root, 'playwright', 'index.js')).href)
  } catch (e) {}
  for (const c of tries) {
    try {
      const mod = await import(c)
      return mod.default || mod
    } catch (e) {}
  }
  throw new Error('找不到 playwright 模組。請先執行 npm install playwright 或 npm install -g playwright')
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
let tight = 0
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

  // 檢查排版是否溢出。
  // scrollHeight > clientHeight 抓不到這一種:slide 是置中的 flex,內容變多不會捲動,
  // 而是整塊往上頂,被頁首那條蓋住。所以另外量內容離頁首/底部還剩多少。
  // 2026-09-02 就是這樣漏掉一頁——目測看得出來,機器說通過。
  const over = await p.evaluate(() => {
    const s = document.querySelector('.slide.active')
    if (!s) return null
    const bar = document.querySelector('.bar')
    const barBottom = bar ? bar.getBoundingClientRect().bottom : 0
    const kids = [...s.children].filter(e => e.getBoundingClientRect().height > 0)
    if (!kids.length) return null
    const boxes = kids.map(e => e.getBoundingClientRect())
    return {
      scrollH: s.scrollHeight > s.clientHeight + 4,
      scrollW: s.scrollWidth > s.clientWidth + 4,
      頂部留白: Math.round(Math.min(...boxes.map(r => r.top)) - barBottom),
      底部留白: Math.round(window.innerHeight - Math.max(...boxes.map(r => r.bottom))),
      // pre/table/ul 這種自己有 overflow 的,內容被捲掉台下一樣看不到,
      // 但它不會讓外層溢出,所以上面兩個指標抓不到。2026-09-02 第 15 頁就這樣被切掉 236px。
      捲掉的元素: [...s.querySelectorAll('pre, table, ul, ol, .points')]
        .filter(e => e.scrollHeight > e.clientHeight + 8 || e.scrollWidth > e.clientWidth + 8)
        .map(e => e.tagName.toLowerCase() + '(' + (e.scrollHeight - e.clientHeight) + 'px)')
    }
  })

  if (over) {
    if (over.scrollH || over.scrollW) {
      console.warn(`警告: 第 ${i} 頁內容超出可視範圍`)
    }
    if (over.捲掉的元素 && over.捲掉的元素.length) {
      console.warn(`警告: 第 ${i} 頁有元素自己在捲,捲掉的部分投影機上看不到: ${over.捲掉的元素.join('、')}`)
      tight++
    }
    if (over.頂部留白 < 16 || over.底部留白 < 16) {
      console.warn(`警告: 第 ${i} 頁內容快撞到邊了 (離頁首 ${over.頂部留白}px, 離底部 ${over.底部留白}px)。內容要減量`)
      tight++
    }
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

console.log(tight > 0
  ? `OK: 逐頁結構與翻頁驗收通過(但有 ${tight} 頁內容快撞到邊,見上面的警告)。`
  : 'OK: 逐頁結構與翻頁驗收通過。')

// 產出縮圖
if (command === 'all' || command === 'thumbs') {
  const thumbDir = join(TARGET_DIR, 'assets/thumbs')
  mkdirSync(thumbDir, { recursive: true })
  
  // 主控台左欄的縮圖會放大到約 450px 顯示(左欄佔一半、排兩欄),所以存 960px 寬,
  // 剛好覆蓋 2 倍 DPR。存 320px 的話上台看到的是模糊的,判斷不出那一頁的版面配置。
  // template 的主控台縮圖抓 t<N>.webp。Playwright 的 screenshot() 只吐 png/jpeg,
  // 不能直接存 webp;用 canvas.toDataURL('image/webp') 轉一次再寫檔,副檔名才對得上。
  // 舊版寫 .webp 但 Playwright 拋錯後 fallback 成 .jpg,結果 template 全 404、左欄空白。
  const tp = await ctx.newPage()
  const thumbUris = []   // 給手機遙控與 file:// host 用的內嵌 data URI(160x90)
  for (let i = 0; i < n; i++) {
    const b64 = await tp.evaluate(async (jpegB64) => {
      const img = new Image()
      img.src = 'data:image/jpeg;base64,' + jpegB64
      await img.decode()
      const c = document.createElement('canvas')
      c.width = 960; c.height = Math.round(960 * img.naturalHeight / img.naturalWidth)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      return c.toDataURL('image/webp', 0.82).split(',')[1]
    }, shots[i].toString('base64'))
    writeFileSync(join(thumbDir, `t${i + 1}.webp`), Buffer.from(b64, 'base64'))
    // 另存一份 160x90 的小 data URI(手機遙控觸控板底圖 + file:// 開啟時 host 讀不到本機檔的後備)
    const small = await tp.evaluate(async (jpegB64) => {
      const img = new Image()
      img.src = 'data:image/jpeg;base64,' + jpegB64
      await img.decode()
      const c = document.createElement('canvas')
      c.width = 160; c.height = 90
      c.getContext('2d').drawImage(img, 0, 0, 160, 90)
      return c.toDataURL('image/webp', 0.7)
    }, shots[i].toString('base64'))
    thumbUris.push(small)
  }
  await tp.close()
  writeFileSync(join(thumbDir, '..', 'thumbs.js'),
    'window.DECK_THUMBS = ' + JSON.stringify(thumbUris) + ';\n')
  console.log(`縮圖: ${n} 張已生成 -> assets/thumbs/ (含 assets/thumbs.js 內嵌 data URI)`)
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
  writeFileSync(outPdfPath, pdfBuffer)
  console.log(`PDF: 16:9 投影片 PDF 匯出完成 -> ${outPdfPath}`)
}

await b.close()
console.log('完成。')

