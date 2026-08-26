# slide-deck-skill

跨平台專業 16:9 網頁簡報與講義製作 Skill。支援手機無線遙控、雙螢幕跨視窗同步主控台、PACE 節奏計時、逐頁排版溢出檢查、高解析度截圖轉 16:9 PDF、與配套講義生成。

---

## 核心特色

- **零依賴播放**：純 HTML5 + CSS + 原生 JS，任何瀏覽器（Chrome、Edge、Safari、Firefox）雙擊即播，支援 Windows、macOS、Linux 與平板觸控。
- **手機無線遙控（跨裝置同步）**：按 P 點擊「手機遙控」，手機相機掃描 QR Code 即可化身遙控器（超大翻頁按鈕、觸控震動回饋、即時講稿備忘與時間同步），開箱即用免設定。
- **講者雙螢幕主控台（按 P）**：筆電開主控台（看講稿備註、縮圖清單、超時警示），投影機開全螢幕投影片，兩視窗透過 localStorage 毫秒級自動同步（斷網亦穩定運作）。
- **PACE 節奏時間守護**：內建每頁目標時間倒數，講超時右上角計時器自動轉紅提醒。
- **自動化驗收與 16:9 PDF 匯出**：透過 Playwright 自動翻頁測試，自動偵測排版溢出、自動生成縮圖清單、無損匯出 16:9 PDF。
- **學員講義配套**：內建獨立的 handout.html 與一鍵 A4 PDF 轉檔工具。
- **開源中繼服務**：內建極簡 Cloudflare Worker WebSocket 轉發架構（worker/），零資料庫、零隱私洩漏。

---

## 安裝方式

### 1. 安裝給 AI Agent（Claude Code / Antigravity / Codex）

```bash
# Clone 到本地並建立 symlink
git clone https://github.com/yazelin/slide-deck-skill ~/slide-deck-skill
ln -s ~/slide-deck-skill ~/.claude/skills/slide-deck
```

### 2. 一般開發者與聽眾使用

只需安裝 Node.js 與 Playwright（用來執行自動化測試與 PDF 匯出）：

```bash
git clone https://github.com/yazelin/slide-deck-skill my-deck-tools
cd my-deck-tools
npm install
```

---

## 快速上手

### 建立一個新的簡報與講義專案

```bash
node deck.mjs init ./my-talk --title "AI Agent 架構實戰"
cd my-talk
```

專案目錄會包含：
```text
my-talk/
├── deck.html           # 簡報主檔（瀏覽器打開即可播放，按 P 開啟主控台／手機遙控）
├── deck.css            # 16:9 響應式樣式庫
├── qrcode.min.js       # 純前端向量 QR Code 生成器
├── deck-tools.mjs      # 自動驗收、縮圖與 16:9 PDF 匯出工具
├── handout.html        # 學員講義樣板
├── handout-to-pdf.mjs  # 講義 A4 PDF 轉換工具
└── assets/thumbs/      # 主控台縮圖存放目錄
```

### 常用指令

```bash
# 1. 執行排版溢出檢查、產生縮圖並匯出 16:9 投影片 PDF
node deck-tools.mjs

# 2. 只匯出學員講義 A4 PDF
node handout-to-pdf.mjs

# 3. 只進行排版與頁數檢查
node deck-tools.mjs verify

# 4. 啟動 100% 離線區域網路同步伺服器（斷網環境使用）
node /home/ct/slide-deck-skill/deck.mjs serve 8080 .
```

---

## 手機無線遙控怎麼用

1. 電腦打開 deck.html，按下鍵盤上的 P 鍵開啟講者主控台。
2. 點擊右上角的「手機遙控」按鈕，螢幕會跳出專屬配對 QR Code。
3. 拿起手機相機掃描，手機會開啟專屬遙控介面，立即在台上單手翻頁、隨時看講稿備忘。

---

## 播放快捷鍵一覽

| 快捷鍵 | 說明 |
| :--- | :--- |
| **`→` / `Space` / `PageDown`** | 下一頁 |
| **`←` / `PageUp`** | 上一頁 |
| **`Home` / `End`** | 回第一頁／跳到最後一頁 |
| **`P`** | 開啟／關閉講者主控台（含手機遙控、PACE 計時與縮圖） |
| **`N`** | 投影片右下角疊加備註視窗（單螢幕演練用） |
| **`R`** | 節奏計時器歸零 |

| **`Esc`** | 退出全螢幕、關閉彈窗或關閉圖片燈箱 |
| **觸控滑動（Swipe）** | 平板／手機觸控翻頁 |

---

## 授權

MIT License © [林亞澤 (Yaze Lin)](https://github.com/yazelin)

---

<p align="center">
  <a href="https://github.com/yazelin">GitHub</a> ·
  <a href="https://www.facebook.com/yaze.lin.gm">Facebook</a> ·
  <a href="https://buymeacoffee.com/yazelin">請亞澤喝咖啡</a>
</p>
