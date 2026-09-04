# 直播互動頁（/live）設計

2026-09-04

## 目的

每週三晚上八點對 LINE 社群直播時，觀眾開一個網址就能同時做三件事：跟著簡報翻頁、按反應、留言。反應統計即時顯示給房裡所有人，觀眾自己也看得到。

## 現況

- `worker/src/index.ts` 是 Cloudflare Worker 加一個 Durable Object（`DeckRoom`），已部署在 `deck-sync.yazelinj303.workers.dev`。
- 房間目前是純轉發：收到任何訊息就原樣廣播給其他連線，額外只保存一份 `lastState`。
- 角色有三種：`host`（`deck.html`）、`remote`（`/remote` 手機遙控）、`viewer`。`viewer` 是預設值，而且不帶 pin 也能連（`index.ts:452`）。
- 房號在 `deck.html:192` 隨機生成後存進 `sessionStorage`，每次重開簡報就換一個。

## 不做

- 投票。
- 留言審核。留言不經人工放行，直接上牆。
- 帳號與登入。講者固定是同一個人，開得起 host 頁就是講者。

## 一、房號固定

`deck.html` 讀網址參數 `?room=`，有就用它，沒有才隨機生成。週三這條線固定用 `room=wed`，觀眾連結不必每週更換。

## 二、DeckRoom 加計數

房間內的狀態（存在記憶體，房間睡著就歸零，這個代價可以接受）：

- `page`：目前頁碼
- `pace`：連線編號對到 `faster`、`slower`、`lost` 其中一個
- `reactions`：`{ like, agree }`
- `comments`：環狀緩衝，保留最近 50 則

觀眾送上來的訊息：

| type | 欄位 | 行為 |
| --- | --- | --- |
| `pace` | `v`：`faster`、`slower`、`lost` | 每條連線每頁一票。同一顆再按等於取消，按另一顆等於改票 |
| `react` | `v`：`like`、`agree` | 純累加，客戶端做一秒節流擋連點 |
| `comment` | `text` | 裁到 200 字，推進環狀緩衝 |

清零規則：收到 `host` 送來的 `state`，且 `page` 與上次不同時，`pace` 整個清空。`reactions` 與 `comments` 不受翻頁影響。

廣播：每 250 毫秒合併送一次，收件人是房裡所有連線，含觀眾與遙控器。

```
{ type: 'tally', page, pace: { faster, slower, lost }, reactions: { like, agree }, comments: [...] }
```

連線識別用 `ws.serializeAttachment({ id })` 在 accept 當下寫入，`webSocketMessage` 裡用 `deserializeAttachment` 讀回。這樣即使 Durable Object 進入 hibernation 再醒來，去重仍然成立。

## 三、`/live` 觀眾頁

由 worker 直接吐出內嵌 HTML，做法與現有的 `/remote` 相同。網址形如 `/live?room=wed&deck=<簡報網址>`。

版面以手機為主：

- 上段是 16:9 的 `iframe`，`src` 為 deck 網址加上 `?room=wed&role=viewer`。
- 中段五顆按鈕橫排，每顆右上角掛即時數字。快一點、慢一點、聽不懂這三顆每翻一頁歸零；喜歡、同意這兩顆整場累計。
- 下段是留言牆，最新的在最上面，底下接輸入框。

房間還沒活起來時（`/state` 回傳的 `last_state` 是 `null`），頁面顯示「直播還沒開始」，`iframe` 不載入。這對上了「沒推內容就沒東西看」的預期。

## 四、`deck.html` 的 viewer 模式

網址帶 `?role=viewer` 時：

- WebSocket 以 `role=viewer` 連線，不帶 pin。
- 不呼叫 `broadcastState`。
- 不綁鍵盤與滑鼠翻頁。
- 隱藏主控台與手機遙控按鈕。
- 收到 `host` 的 `state` 訊息就 `show(msg.page, true)`。

這條路繞開了既有的坑：deck 只在載入當下讀一次 `location.hash`，事後改 hash 不會翻頁。讓 `iframe` 裡的簡報自己連上房間跟隨，外層就不需要 `postMessage`。

## 五、遙控器顯示

`/remote` 頂部狀態列右側加一條統計，另外開一個留言分頁。講者上台時手上拿的就是它。

## 六、每週流程

直播前把該場的 deck 資料夾複製到 `yazelin.github.io` 的 `live/` 底下推上去，這一步接到各場資料夾既有的 `開終端機.sh`。

## 驗收

1. `worker/test/tally.mjs`，用 `node:test` 與 `assert`，不引入框架。要斷言的行為：翻頁把 `pace` 清零；同一連線重按同一顆等於取消；改按另一顆等於改票；留言超過 50 則捨棄最舊的；`react` 純累加、不受翻頁影響。
2. `scripts/smoke.mjs` 補一段 Playwright：開一個 host 與兩個 viewer，host 翻頁後兩個 viewer 的頁碼跟上；兩個 viewer 都按快一點得到 2，host 再翻一頁後歸 0。

## 影響檔案

`worker/src/index.ts`、`templates/deck.html`、`scripts/smoke.mjs`、`worker/test/tally.mjs`（新增）、`README.md`、`SKILL.md`
