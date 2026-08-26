---
name: slide-deck
description: Use when the user wants to create, edit, verify, or export professional 16:9 HTML presentations, dual-screen synchronized slide decks, speaker notes, or printable companion handouts. Supports Windows, macOS, and Linux.
---

# slide-deck 簡報製作與自動化 Skill

這是一套經過實戰驗證的 16:9 網頁簡報系統。支援雙螢幕跨視窗同步主控台、PACE 節奏計時、逐頁排版溢出檢查、高解析度截圖轉 PDF、與配套講義生成。

---

## 快速指令

```bash
# 1. 建立新簡報專案骨架
node /home/ct/slide-deck-skill/deck.mjs init <專案路徑> --title "主題名稱"

# 2. 進入專案目錄
cd <專案路徑>

# 3. 執行全自動驗收、產生縮圖與匯出 16:9 PDF
node deck-tools.mjs

# 4. 只匯出學員講義 A4 PDF
node handout-to-pdf.mjs
```

---

## 投影片視覺與排版規格

### 1. 頁面模式（Slide Modes）
- **預設暗底頁（Dark Theme）**：琥珀金（`--amber`）焦點字 + 墨黑底（`--ink`）。適合主體概念、重點條列與代碼。
- **淺色頁（`.slide.light`）**：薄荷晨光白底（`--day-bg`）+ 深墨綠（`--day-ink`）。適合架構對比、流程圖與技術拆解。
- **宣言頁（`.slide.statement`）**：大字號（`p.big`），用於章節切換或核心金句。

### 2. 常用元件
- **重點清單**：`<ul class="points"><li><strong>標題</strong>：內容<span class="dim">（補充）</span></li></ul>`
- **雙欄／三欄**：`<div class="cols">` 或 `<div class="cols.three">`
- **代碼區塊**：`<pre>代碼</pre><p class="code-note">白話交代與心法</p>`
- **統計大數字**：`<div class="stats"><div class="stat"><b>4:48</b><span>交付時間</span></div></div>`
- **互動即時站台／影片**：
  ```html
  <div class="livewrap" id="demo-box">
    <button class="fsbtn" data-load="demo-box" data-max="demo-box" type="button">載入</button>
    <div id="demo-box-slot" data-src="https://example.com"></div>
  </div>
  ```

---

## 講稿備註（Speaker Notes）鐵則

1. **1:1 數量契約**：`<div id="notes">` 內部的 `<div>` 數量**必須與 `<section class="slide">` 完全一致**，否則 `deck-tools.mjs` 會拋出錯誤中斷。
2. **備忘撰寫公式**：
   - **導覽（指哪裡）**：告訴講者開場指螢幕上的哪個重點。
   - **心法（為什麼這樣設計）**：交代技術背後的深層考量與金句。
   - **備援交代**：例如「網路慢時切備援影片」、「有人問再展開」。

---

## 節奏規劃（PACE 陣列）

在 `<script>` 內的 `PACE` 陣列定義每一頁的**累積目標分鐘數**（例如 30 頁 90 分鐘直播：`[2, 5, 8, 12, ... 90]`）：
- 當講到該頁時，若時間超過目標數值，主控台右上角的計時器會**自動由白轉紅**提醒講者加速。

---

## 跨平台與播放快捷鍵

| 按鍵 | 功能 | 備註 |
| :--- | :--- | :--- |
| **`←` / `→` / `Space` / `PageDown`** | 前後翻頁 | 跨瀏覽器與簡報筆通用 |
| **`Home` / `End`** | 回首頁／跳到最後一頁 | 快速跳轉 |
| **`P`** | 開啟／關閉講者主控台 | 兩視窗透過 localStorage 即時雙向同步 |
| **`N`** | 投影片下緣抽屜式備註 | 單螢幕演練時使用 |
| **`R`** | 節奏計時器歸零 | 開播前重置時間 |

| **`Esc`** | 退出滿版或關閉燈箱 | 逃生口 |
| **觸控滑動（Swipe）** | 平板／手機觸控翻頁 | 支援行動裝置 |

---

## 自動化驗證工具原理（`deck-tools.mjs`）

`deck-tools.mjs` 透過 Playwright 執行無頭瀏覽器，進行四項嚴格驗收：
1. **頁數 vs 備註一致性檢查**：確保講稿不缺漏。
2. **自動翻頁路徑模擬**：確認每一頁能正常翻到且計數器正確更新。
3. **排版溢出偵測（Overflow Detection）**：自動比對 `scrollHeight > clientHeight`，抓出內容超出投影畫面的頁面。
4. **無損 16:9 PDF 匯出**：採用高畫質截圖合成 PDF，避免 CSS `@media print` 跑版。
