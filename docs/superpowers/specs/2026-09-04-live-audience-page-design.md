# 直播互動頁（/live）設計

2026-09-04

## 目的

每週三晚上八點對 LINE 社群直播時，觀眾開一個網址就能跟著簡報翻頁、按反應、留言。觀眾之間看得到彼此的留言與計數，而且這些內容會疊回講者分享出去的簡報畫面，所以連沒開互動頁的人也在影片裡看得到。

## 現況

- `worker/src/index.ts` 是 Cloudflare Worker 加一個 Durable Object（`DeckRoom`），已部署在 `deck-sync.yazelinj303.workers.dev`。
- 房間目前是純轉發：收到任何訊息就原樣廣播給其他連線，額外只保存一份 `lastState`。
- 角色有三種：`host`（`deck.html`）、`remote`（`/remote` 手機遙控）、`viewer`。`viewer` 是預設值，而且不帶 pin 也能連（`index.ts:452`）。
- 房號在 `deck.html:192` 隨機生成後存進 `sessionStorage`，每次重開簡報就換一個。
- deck 已經內建 `qrcode.min.js` 與 QR 生成邏輯，現在用來產手機遙控連結。

## 不做

- 投票。
- 留言審核。留言不經人工放行，直接上牆。
- 帳號與登入。講者固定是同一個人，開得起 host 頁就是講者。

## 資料流

四種角色共用一個房間，房號固定 `wed`。

- `host`（講者筆電的 `deck.html`）往上送 `state`：頁碼、標題、講稿、縮圖。
- `remote`（講者手機的 `/remote`）往上送 `next`、`prev`、`jump`、`laser`、`draw`。
- `viewer`（觀眾的 `/live`，多人）往上送 `pace`、`react`、`comment`、`like`。
- 房間每 250 毫秒合併廣播一次 `tally` 給房裡所有連線，含觀眾自己。

`/live` 頁面裡的簡報是一個 `iframe`，指向同一份 deck 加上 `?room=wed&role=viewer`。它自己連上房間跟隨翻頁，外層不需要 `postMessage`。這條路繞開既有的坑：deck 只在載入當下讀一次 `location.hash`，事後改 hash 不會翻頁。

## 一、房號固定

`deck.html` 讀網址參數 `?room=`，有就用它，沒有才隨機生成。週三這條線固定用 `room=wed`，觀眾連結不必每週更換。

## 二、DeckRoom 加計數

房間內的狀態存在記憶體，房間睡著就歸零，這個代價可以接受。

- `page`：目前頁碼
- `pace`：連線編號對到 `faster`、`slower`、`lost` 其中一個
- `reactions`：`{ like, agree }`
- `comments`：最多 100 則，每則 `{ id, name, text, q, likes, likedBy, answered, at }`
- `viewers`：目前 `role=viewer` 的連線數
- `burst`：這個週期內新增的反應次數，廣播後歸零

觀眾送上來的訊息：

| type | 欄位 | 行為 |
| --- | --- | --- |
| `pace` | `v`：`faster`、`slower`、`lost` | 每條連線每頁一票。同一顆再按等於取消，按另一顆等於改票 |
| `react` | `v`：`like`、`agree` | 純累加，客戶端做一秒節流擋連點。同時累進 `burst` |
| `comment` | `name`、`text`、`q` | `text` 裁到 200 字，`name` 裁到 12 字，`q` 標記這則是問題 |
| `like` | `id` | 對某則留言加一。每條連線每則只算一次，再按取消 |

講者（`host` 或 `remote`）送上來的：

| type | 欄位 | 行為 |
| --- | --- | --- |
| `answered` | `id` | 把某則問題標記成已回答 |

清零規則：收到 `host` 送來的 `state` 且 `page` 與上次不同時，`pace` 整個清空。`reactions`、`comments`、`likes` 不受翻頁影響。

廣播內容：

```
{ type: 'tally', page, viewers,
  pace: { faster, slower, lost },
  reactions: { like, agree },
  burst: { like, agree },
  comments: [...] }
```

連線識別用 `ws.serializeAttachment({ id })` 在 accept 當下寫入，`webSocketMessage` 裡用 `deserializeAttachment` 讀回。這樣即使 Durable Object 進入 hibernation 再醒來，投票去重與按讚去重仍然成立。

## 三、留言排序

留言依 `likes` 由多到少排，同讚數的新的在上面。側欄與 `/live` 都套同一條規則，所以被按讚的問題會自己浮上去，講者一眼看得到該回答哪一句。

已標記 `answered` 的問題沉到最底並劃掉。

## 四、`/live` 觀眾頁

由 worker 直接吐出內嵌 HTML，做法與現有的 `/remote` 相同。網址形如 `/live?room=wed&deck=<簡報網址>`。版面以手機直向為主。

- 頂：目前在線人數，以及自己的暱稱（可點開改）。
- 上段：16:9 的 `iframe`，`src` 是 deck 網址加上 `?room=wed&role=viewer`。
- 中段：五顆按鈕，每顆掛即時數字。快一點、慢一點、聽不懂這三顆每翻一頁歸零；喜歡、同意這兩顆整場累計。按下去有一個圖示往上飄的動畫，而且房間廣播 `burst`，所以別人按的時候自己畫面上也會飄。
- 下段：留言牆，每則可以按讚，讚多的在上面。輸入框旁有一個「這是問題」的勾選。

暱稱第一次進來自動發一個可愛代號，存進 `localStorage`，下次進來還在，隨時可以改。

房間還沒活起來時（`/state` 回傳的 `last_state` 是 `null`），頁面顯示直播還沒開始，`iframe` 不載入。這對上了「沒推內容就沒東西看」的預期。

## 五、`deck.html` 的兩個新模式

### viewer 模式

網址帶 `?role=viewer` 時：WebSocket 以 `role=viewer` 連線不帶 pin；不呼叫 `broadcastState`；不綁鍵盤與滑鼠翻頁；隱藏主控台與手機遙控按鈕；收到 `host` 的 `state` 就 `show(msg.page, true)`。

### host 的右側欄

`host` 模式加一條可收合的右側欄，寬度約 22%，簡報區相應縮排。這是講者分享到 Google Meet 的畫面，所以側欄的內容等於全體觀眾看得到的內容。

側欄由上到下：

1. QR Code 加短網址，指向 `/live?room=wed&deck=…`。常駐，晚進來的人隨時掃得到。
2. 在線人數。
3. 計數列：快、慢、卡、讚、同意。
4. 留言，依讚數排序，容納約六到八則，其餘捲動。

側欄可以用一個鍵收合，遇到需要整個畫面的頁面時用得上。

## 六、遙控器補強

`/remote` 頂部狀態列加一條計數，另外開一個留言分頁：依讚數排序、顯示問題標記、每則旁邊一個「已回答」按鈕。講者上台時手上拿的就是它。

## 七、每週流程

直播前把該場的 deck 資料夾複製到 `yazelin.github.io` 的 `live/` 底下推上去，這一步接到各場資料夾既有的 `開終端機.sh`。

## 驗收

1. `worker/test/tally.mjs`，用 `node:test` 與 `assert`，不引入框架。要斷言的行為：翻頁把 `pace` 清零；同一連線重按同一顆等於取消；改按另一顆等於改票；`react` 純累加、不受翻頁影響；同一連線對同一則留言按讚只算一次；留言超過 100 則捨棄最舊的；排序是讚數優先、同讚數比時間；`answered` 的留言排到最後。
2. `scripts/smoke.mjs` 補一段 Playwright：開一個 host 與兩個 viewer，host 翻頁後兩個 viewer 的頁碼跟上；兩個 viewer 都按快一點得到 2，host 再翻一頁後歸 0；viewer A 留言，viewer B 看得到並按讚，該則浮到最上面；host 的側欄同步顯示這則留言；在線人數顯示 2。

## 影響檔案

`worker/src/index.ts`、`templates/deck.html`、`scripts/smoke.mjs`、`worker/test/tally.mjs`（新增）、`README.md`、`SKILL.md`
