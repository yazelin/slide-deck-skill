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
node <skill 根目錄>/deck.mjs init <專案路徑> --title "主題名稱"

# 2. 進入專案目錄
cd <專案路徑>

# 3. 執行全自動驗收、產生縮圖與匯出 16:9 PDF
node deck-tools.mjs

# 4. 只匯出學員講義 A4 PDF
node handout-to-pdf.mjs
```

---

## 投影片視覺與排版規格

### 0. 配色：取，不是挑

色票從這場要講的那個東西身上取，不要自己配一組好看的。取的順序：

1. 該專案自己的設計系統或 CSS 變數（線上站台開 DevTools 抓 `:root`）。
2. 沒有設計系統就取品牌 repo 或站台的主視覺色。
3. 沒有這種對象（講觀念、講方法、講一份調查結果都算），用模板預設的琥珀配米白。

**一場一個主角。** 取色時發現有兩個以上的對象可取,先回頭看題目是不是沒收斂 —— 簡報本來就該聚焦單一主題,不要用配色去遷就一個過寬的題目。真的是拆解場或比較場(比較本身就是題目),才用頁型分配:深色頁取一個、淺色頁取另一個,不要把兩組色調和成第三種。

**不要為了取色停下來問使用者。** 手上的資訊看得出主角就去取，看不出來就用預設往下做，最後告訴使用者色是從哪裡來的。多問一輪的成本比用預設色高。

取回來的值只填 `templates/deck.css` 最上面 `:root` 那 17 個變數（底色、字色、主色、次色，加淺色頁的四個），其他規則一行都不要改。

**取完要記來源**：寫進 `spec.md`，或放在 `deck.css` 頂端一行註解。沒記的話下個月回頭看，沒有人知道這組色哪來的，也沒辦法換一場再取一次。

這一步排在「排骨架」之後、「寫內容」之前。骨架還沒定就先挑色，等於先決定了結論。

### 1. 頁面模式（Slide Modes）
- **預設暗底頁（Dark Theme）**：焦點字（`--amber`）+ 底色（`--ink`）。模板預設是琥珀金配墨黑，取色後會換掉。適合主體概念、重點條列與代碼。
- **淺色頁（`.slide.light`）**：淺底（`--day-bg`）+ 深字（`--day-ink`）。模板預設是薄荷晨光配深墨綠。適合架構對比、流程圖與技術拆解。
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

## 頁裡內嵌別的站，要先確認三件事

簡報頁的 `.livewrap` 可以把一個真站嵌進來現場操作。能不能嵌，決定於**對方的站**，不是簡報：

1. **對方不能設 `X-Frame-Options` 或 `frame-ancestors`。** GitHub Pages 沒設，嵌得動；Larch 的市集頁有設，只能開新分頁。用 `curl -sI <網址> | grep -i "x-frame\|content-security"` 一秒看得出來。
2. **對方站碰得到儲存空間嗎。** 這條只在**簡報本身跑在 sandbox iframe 裡**時才會踩到（例如整份簡報變成 Larch 的插件卡）。那個環境的 origin 是 null，`localStorage`、`sessionStorage`、`IndexedDB`、Service Worker 全部一碰就丟 SecurityError。開機就讀 storage 的站會整支腳本當場死掉，畫面停在載入中。自己的站就包一層：拿不到就換一個記憶體版的物件，功能照跑、只是關掉就忘。
3. **對方站的音訊有沒有帶 `crossorigin="anonymous"`。** 同樣只在 sandbox 裡發生，但**症狀最難認**：進度在走、狀態寫著播放中、音量也不是 0，就是沒有聲音，頻譜還全平。原因是 origin 變成 null 之後，那個站自己的 mp3 對它來說是跨網域，沒用 CORS 模式載入的音訊一旦接進 `AudioContext`（`createMediaElementSource`）就會被消音。加上屬性就好，GitHub Pages 對音檔本來就回 `Access-Control-Allow-Origin: *`。

**驗收要量頻譜能量，不要量畫面。** 這三件事都不會報錯。可靠的做法是在一個 `sandbox="allow-scripts"` 的 iframe 裡再嵌那個站，攔 `AnalyserNode.prototype.getByteFrequencyData` 把節點抓出來，加總幾次取平均：**沒聲音時是 0，有聲音是四位數**。數 canvas 的亮點沒有用，因為特效動畫本來就一直在動，有沒有聲音都看不出差別。

現場穩定度的兩個習慣：網路不確定的站用 `data-load` 讓它按了才載，重要的示範站再錄一支 `data-video` 備援影片放在同一個框裡。

## 放進 Larch 視覺小說裡講（larch-slide-deck）

同一套版面有一個 Larch 插件版：[yazelin/larch-slide-deck](https://github.com/yazelin/larch-slide-deck)。簡報用 Markdown 型標記寫（`---` 分頁、`# 標題`、`- 條列`、`| 表格 |`、`> 講稿`、`@embed 網址`），`push.py` 推成專案裡的一張全螢幕插件卡，N／P／方向鍵、手機遙控、配色都在。要在 Larch 的播放器裡講簡報就用它，不要把 deck.html 整份塞進小遊戲卡。

