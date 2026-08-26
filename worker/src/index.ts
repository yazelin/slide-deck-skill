export interface Env {
  ROOMS: DurableObjectNamespace
}

// 內建的手機遙控面板 HTML（響應式、大按鈕、震動回饋、即時顯示講稿與計時）
const REMOTE_HTML = `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>簡報手機遙控器</title>
<style>
  :root {
    --bg: #0d0c0a; --surface: #1a1712; --border: #2e2920;
    --amber: #f4b53a; --amber-active: #d98a1e; --cream: #f3efe6; --muted: #8c846f;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }
  html, body {
    height: 100%; height: 100dvh;
    background: var(--bg); color: var(--cream);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    overflow: hidden; overscroll-behavior: none;
  }
  body {
    display: flex; flex-direction: column;
  }
  .header {
    flex-shrink: 0; display: flex; justify-content: space-between; align-items: center;
    padding: 0.7rem 1rem; background: var(--surface); border-bottom: 1px solid var(--border);
    padding-top: max(0.7rem, env(safe-area-inset-top));
  }
  .status { font-size: 0.8rem; display: flex; align-items: center; gap: 0.4rem; color: var(--muted); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; }
  .dot.connected { background: #22c55e; }
  .timer { font-family: ui-monospace, monospace; font-size: 1.1rem; font-weight: 700; color: #fff; }
  
  .info {
    padding: 0.75rem 1rem; flex: 1 1 0%; min-height: 0; overflow-y: auto;
    display: flex; flex-direction: column; gap: 0.4rem; -webkit-overflow-scrolling: touch;
  }
  .page-num { font-size: 0.85rem; color: var(--amber); font-weight: 700; }
  .slide-title { font-size: 1.15rem; font-weight: 700; line-height: 1.35; color: #fff; }
  .note-box {
    margin-top: 0.3rem; background: var(--surface); border-left: 3px solid var(--amber);
    padding: 0.75rem 0.9rem; border-radius: 0 6px 6px 0; font-size: 0.92rem; line-height: 1.6;
    color: #ded7c6; flex: 1 1 0%; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch;
  }
  .note-box b { color: var(--amber); }

  .controls {
    flex-shrink: 0; display: grid; grid-template-columns: 1fr 1.6fr; gap: 0.7rem;
    padding: 0.75rem 1rem; background: var(--surface); border-top: 1px solid var(--border);
    padding-bottom: max(1.2rem, calc(env(safe-area-inset-bottom) + 0.5rem));
  }
  .btn {
    border: 0; border-radius: 12px; font-size: 1.15rem; font-weight: 700;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    padding: 1.1rem 0; touch-action: manipulation; transition: transform 0.08s, filter 0.08s;
  }
  .btn:active { transform: scale(0.96); filter: brightness(0.9); }
  .btn-prev { background: #26221a; color: var(--muted); border: 1px solid var(--border); }
  .btn-next { background: var(--amber); color: #12100c; }
  .hint { flex-shrink: 0; text-align: center; font-size: 0.7rem; color: var(--muted); padding: 0.2rem 0; }
</style>
</head>

<body>

<div class="header">
  <div class="status"><div class="dot" id="dot"></div><span id="stext">連線中...</span></div>
  <div class="timer" id="timer">00:00</div>
</div>

<div class="info">
  <div class="page-num" id="pnum">第 1 / 1 頁</div>
  <div class="slide-title" id="title">準備就緒</div>
  <div class="note-box" id="notes">尚未收到講稿備註</div>
</div>

<div class="hint">點擊按鈕或音量鍵皆可翻頁</div>
<div class="controls">
  <button class="btn btn-prev" id="btn-prev">◀ 上一頁</button>
  <button class="btn btn-next" id="btn-next">下一頁 ▶</button>
</div>

<script>
(function() {
  var url = new URL(location.href);
  var room = url.searchParams.get('room');
  var pin = url.searchParams.get('pin');
  var dot = document.getElementById('dot');
  var stext = document.getElementById('stext');
  var pnum = document.getElementById('pnum');
  var title = document.getElementById('title');
  var notes = document.getElementById('notes');
  var timer = document.getElementById('timer');
  var btnPrev = document.getElementById('btn-prev');
  var btnNext = document.getElementById('btn-next');
  var ws = null;
  var curPage = 1, totalPages = 1;

  if (!room) {
    stext.textContent = '缺少房間參數';
    alert('缺少 room 參數，請重新掃描簡報螢幕上的 QR Code！');
    return;
  }

  function vibrate() {
    if (navigator.vibrate) {
      try { navigator.vibrate(35); } catch(e) {}
    }
  }

  function connect() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var wsUrl = proto + '//' + location.host + '/ws?room=' + encodeURIComponent(room) + '&role=remote' + (pin ? '&pin=' + encodeURIComponent(pin) : '');
    ws = new WebSocket(wsUrl);

    ws.onopen = function() {
      dot.classList.add('connected');
      stext.textContent = '🟢 已連線 (' + room + ')';
    };

    ws.onmessage = function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'state') {
          curPage = data.page + 1;
          totalPages = data.total || totalPages;
          pnum.textContent = '第 ' + curPage + ' / ' + totalPages + ' 頁';
          if (data.title) title.textContent = data.title;
          if (data.note) notes.innerHTML = data.note;
          if (data.timer) timer.textContent = data.timer;
        }
      } catch(err) {}
    };

    ws.onclose = function() {
      dot.classList.remove('connected');
      stext.textContent = '🔴 斷線重試中...';
      setTimeout(connect, 2000);
    };

    ws.onerror = function() {
      ws.close();
    };
  }

  function sendCmd(action) {
    vibrate();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: action }));
    }
  }

  btnPrev.onclick = function() { sendCmd('prev'); };
  btnNext.onclick = function() { sendCmd('next'); };

  // 支援滑動手勢
  var tx = null;
  addEventListener('touchstart', function(e) { tx = e.touches[0].clientX; }, { passive: true });
  addEventListener('touchend', function(e) {
    if (tx === null) return;
    var dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 40) {
      if (dx < 0) sendCmd('next');
      else sendCmd('prev');
    }
    tx = null;
  }, { passive: true });

  connect();
})();
</script>
</body>
</html>`

export class DeckRoom implements DurableObject {
  state: DurableObjectState
  pin: string | null = null
  lastState: any = null

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.headers.get('Upgrade') === 'websocket') {
      const pin = url.searchParams.get('pin')
      const role = url.searchParams.get('role') || 'viewer'

      if (!this.pin && pin) {
        this.pin = pin
      } else if (this.pin && pin && this.pin !== pin) {
        return new Response(JSON.stringify({ error: 'invalid_pin' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)

      this.state.acceptWebSocket(server, [role])

      if (this.lastState) {
        try {
          server.send(JSON.stringify(this.lastState))
        } catch (e) {}
      }

      return new Response(null, { status: 101, webSocket: client })
    }

    if (url.pathname === '/state') {
      return new Response(JSON.stringify({ active: true, has_pin: !!this.pin, last_state: this.lastState }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    return new Response('Deck Room Active', { status: 200 })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message)
      const data = JSON.parse(text)

      if (data.type === 'state') {
        this.lastState = data
      }

      for (const client of this.state.getWebSockets()) {
        if (client !== ws) {
          try {
            client.send(text)
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    try {
      ws.close(code, reason)
    } catch (e) {}
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      })
    }

    // 遙控面板頁面
    if (url.pathname === '/remote' || url.pathname === '/remote.html') {
      return new Response(REMOTE_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'deck-sync',
        version: '1.1.0',
        remote_url: 'https://deck-sync.yazelinj303.workers.dev/remote?room=<room_id>&pin=<pin>',
        timestamp: Date.now()
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    if (url.pathname === '/ws' || url.pathname === '/state') {
      const roomId = url.searchParams.get('room')
      if (!roomId) {
        return new Response(JSON.stringify({ error: 'missing_room' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        })
      }
      const id = env.ROOMS.idFromName(roomId)
      const room = env.ROOMS.get(id)
      return room.fetch(request)
    }

    return new Response('Not found', { status: 404 })
  }
}
