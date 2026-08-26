export interface Env {
  ROOMS: DurableObjectNamespace
}

// 內建的手機遙控面板 HTML（支援：翻頁、雷射筆、螢光筆繪圖、完整講稿備忘、縮圖跳頁）
const REMOTE_HTML = `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>簡報手機遙控器</title>
<style>
  :root {
    --bg: #0d0c0a; --surface: #1a1712; --surface-2: #262118; --border: #332d20;
    --amber: #f4b53a; --amber-active: #d98a1e; --cyan: #22d3ee; --cream: #f3efe6; --muted: #8c846f;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }
  html, body {
    height: 100%; height: 100dvh;
    background: var(--bg); color: var(--cream);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    overflow: hidden; overscroll-behavior: none;
  }
  body { display: flex; flex-direction: column; }
  
  /* 頂部狀態列 */
  .header {
    flex-shrink: 0; display: flex; justify-content: space-between; align-items: center;
    padding: 0.6rem 0.9rem; background: var(--surface); border-bottom: 1px solid var(--border);
    padding-top: max(0.6rem, env(safe-area-inset-top));
  }
  .status { font-size: 0.78rem; display: flex; align-items: center; gap: 0.35rem; color: var(--muted); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; }
  .dot.connected { background: #22c55e; }
  .timer { font-family: ui-monospace, monospace; font-size: 1.1rem; font-weight: 700; color: #fff; }

  /* 模式切換分頁列 */
  .tabs {
    flex-shrink: 0; display: flex; background: var(--surface-2); border-bottom: 1px solid var(--border);
  }
  .tab-btn {
    flex: 1; padding: 0.55rem 0; font-size: 0.82rem; font-weight: 700; color: var(--muted);
    background: none; border: 0; border-bottom: 2px solid transparent; cursor: pointer; text-align: center;
  }
  .tab-btn.active { color: var(--amber); border-bottom-color: var(--amber); background: rgba(244,181,58,0.08); }

  /* 內容容器 */
  .tab-pane { flex: 1 1 0%; min-height: 0; display: none; flex-direction: column; }
  .tab-pane.active { display: flex; }

  /* 分頁 1: 標準遙控 */
  .pane-remote { padding: 0.75rem 1rem; }
  .info {
    flex: 1 1 0%; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0.4rem;
    -webkit-overflow-scrolling: touch;
  }
  .page-num { font-size: 0.85rem; color: var(--amber); font-weight: 700; }
  .slide-title { font-size: 1.15rem; font-weight: 700; line-height: 1.35; color: #fff; }
  .note-box {
    margin-top: 0.25rem; background: var(--surface); border-left: 3px solid var(--amber);
    padding: 0.75rem 0.9rem; border-radius: 0 6px 6px 0; font-size: 0.92rem; line-height: 1.6;
    color: #ded7c6; flex: 1 1 0%; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch;
  }
  .note-box b { color: var(--amber); }

  .controls {
    flex-shrink: 0; display: grid; grid-template-columns: 1fr 1.6fr; gap: 0.7rem;
    padding-top: 0.6rem;
    padding-bottom: max(1rem, calc(env(safe-area-inset-bottom) + 0.4rem));
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

  /* 分頁 2: 雷射筆與螢光筆觸控板 */
  .pane-laser { padding: 0.6rem 0.8rem; gap: 0.6rem; }
  .tool-bar {
    flex-shrink: 0; display: flex; gap: 0.5rem; justify-content: center;
  }
  .tool-btn {
    padding: 0.4rem 0.8rem; font-size: 0.82rem; font-weight: 700; border-radius: 6px;
    background: var(--surface); color: var(--cream); border: 1px solid var(--border); cursor: pointer;
  }
  .tool-btn.active { background: var(--amber); color: #12100c; border-color: var(--amber); }
  .tool-btn.clear { background: #331f1f; color: #ff8888; border-color: #552222; }
  
  .pad-wrap {
    flex: 1 1 0%; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding-bottom: max(0.8rem, env(safe-area-inset-bottom));
  }
  .touchpad {
    width: 100%; aspect-ratio: 16 / 9; max-height: 52vh; background: #16130e;
    border: 2px dashed var(--amber); border-radius: 12px; position: relative;
    touch-action: none; display: flex; align-items: center; justify-content: center;
    box-shadow: inset 0 0 20px rgba(0,0,0,0.8);
  }
  .pad-hint { font-size: 0.85rem; color: var(--muted); pointer-events: none; text-align: center; line-height: 1.5; }
  .touch-dot {
    position: absolute; width: 18px; height: 18px; border-radius: 50%; background: #ff4444;
    box-shadow: 0 0 12px #ff2222; transform: translate(-50%, -50%); display: none; pointer-events: none;
  }

  /* 分頁 3: 縮圖快速跳頁 */
  .pane-jump {
    padding: 0.8rem; overflow-y: auto; -webkit-overflow-scrolling: touch;
    display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem;
    padding-bottom: max(1.2rem, env(safe-area-inset-bottom));
  }
  .jump-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 0.6rem; cursor: pointer; display: flex; flex-direction: column; gap: 0.3rem;
  }
  .jump-card.active { border-color: var(--amber); background: #262014; }
  .jump-card .jnum { font-size: 0.78rem; color: var(--amber); font-weight: 700; }
  .jump-card .jtitle { font-size: 0.85rem; font-weight: 700; color: #fff; line-height: 1.3; }
</style>
</head>

<body>

<div class="header">
  <div class="status"><div class="dot" id="dot"></div><span id="stext">連線中...</span></div>
  <div class="timer" id="timer">00:00</div>
</div>

<!-- 分頁導航 -->
<div class="tabs">
  <button class="tab-btn active" data-tab="remote">🎮 翻頁遙控</button>
  <button class="tab-btn" data-tab="laser">🔴 雷射 / 🖍️ 畫筆</button>
  <button class="tab-btn" data-tab="jump">🖼️ 縮圖跳頁</button>
</div>

<!-- 分頁 1: 標準遙控 -->
<div class="tab-pane pane-remote active" id="pane-remote">
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
</div>

<!-- 分頁 2: 雷射筆與畫筆觸控板 -->
<div class="tab-pane pane-laser" id="pane-laser">
  <div class="tool-bar">
    <button class="tool-btn active" id="btn-mode-laser">🔴 雷射光點</button>
    <button class="tool-btn" id="btn-mode-pen">🖍️ 螢光筆</button>
    <button class="tool-btn clear" id="btn-clear-pen">🧹 清除筆跡</button>
  </div>
  <div class="pad-wrap">
    <div class="touchpad" id="touchpad">
      <div class="pad-hint" id="pad-hint">在此 16:9 觸控板上滑動手指<br>電腦螢幕與直播畫面同步即時跟隨</div>
      <div class="touch-dot" id="touch-dot"></div>
    </div>
  </div>
  <div class="hint" style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom));">
    手指拖曳：指哪亮哪 · 雙擊：翻下一頁
  </div>
</div>

<!-- 分頁 3: 縮圖跳頁 -->
<div class="tab-pane pane-jump" id="pane-jump">
  <!-- 動態生成每一頁縮圖卡片 -->
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
  var paneJump = document.getElementById('pane-jump');
  var ws = null;
  var curPage = 1, totalPages = 1;
  var slideList = [];

  if (!room) {
    stext.textContent = '缺少房間參數';
    alert('缺少 room 參數，請重新掃描簡報螢幕上的 QR Code！');
    return;
  }

  function vibrate(ms) {
    if (navigator.vibrate) {
      try { navigator.vibrate(ms || 35); } catch(e) {}
    }
  }

  // 分頁切換
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.onclick = function() {
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-pane').forEach(function(p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var targetPane = document.getElementById('pane-' + btn.dataset.tab);
      if (targetPane) targetPane.classList.add('active');
      vibrate(15);
    };
  });

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
          if (data.slides && Array.isArray(data.slides)) {
            slideList = data.slides;
            renderJumpList();
          }
        }
      } catch(err) {}
    };

    ws.onclose = function() {
      dot.classList.remove('connected');
      stext.textContent = '🔴 斷線重試中...';
      setTimeout(connect, 2000);
    };

    ws.onerror = function() { ws.close(); };
  }

  function sendCmd(obj) {
    if (typeof obj === 'string') obj = { type: obj };
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  btnPrev.onclick = function() { vibrate(40); sendCmd('prev'); };
  btnNext.onclick = function() { vibrate(40); sendCmd('next'); };

  // 渲染縮圖跳頁清單
  function renderJumpList() {
    paneJump.innerHTML = '';
    slideList.forEach(function(s, i) {
      var card = document.createElement('div');
      card.className = 'jump-card' + (i === curPage - 1 ? ' active' : '');
      card.innerHTML = '<span class="jnum">第 ' + (i + 1) + ' 頁</span><span class="jtitle">' + (s.title || ('投影片 ' + (i + 1))) + '</span>';
      card.onclick = function() {
        vibrate(30);
        sendCmd({ type: 'jump', page: i });
      };
      paneJump.appendChild(card);
    });
  }

  // ==========================================
  // 雷射筆與螢光筆觸控板 (Touchpad)
  // ==========================================
  var touchpad = document.getElementById('touchpad');
  var touchDot = document.getElementById('touch-dot');
  var padHint = document.getElementById('pad-hint');
  var btnModeLaser = document.getElementById('btn-mode-laser');
  var btnModePen = document.getElementById('btn-mode-pen');
  var btnClearPen = document.getElementById('btn-clear-pen');
  var currentTool = 'laser'; // 'laser' | 'pen'
  var isTouching = false;
  var lastSendTime = 0;

  btnModeLaser.onclick = function() {
    currentTool = 'laser';
    btnModeLaser.classList.add('active');
    btnModePen.classList.remove('active');
    touchDot.style.background = '#ff4444';
    vibrate(20);
  };
  btnModePen.onclick = function() {
    currentTool = 'pen';
    btnModePen.classList.add('active');
    btnModeLaser.classList.remove('active');
    touchDot.style.background = '#f4b53a';
    vibrate(20);
  };
  btnClearPen.onclick = function() {
    vibrate(30);
    sendCmd({ type: 'draw_clear' });
  };

  function handleTouch(e, state) {
    e.preventDefault();
    var touch = e.touches[0] || e.changedTouches[0];
    if (!touch) return;
    var rect = touchpad.getBoundingClientRect();
    var x = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    var y = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height));

    if (state === 'start') {
      isTouching = true;
      padHint.style.display = 'none';
      touchDot.style.display = 'block';
      touchDot.style.left = (x * 100) + '%';
      touchDot.style.top = (y * 100) + '%';

      if (currentTool === 'laser') {
        sendCmd({ type: 'laser', x: x, y: y, active: true });
      } else {
        sendCmd({ type: 'draw', state: 'start', x: x, y: y, color: '#f4b53a' });
      }
    } else if (state === 'move' && isTouching) {
      touchDot.style.left = (x * 100) + '%';
      touchDot.style.top = (y * 100) + '%';

      var now = Date.now();
      if (now - lastSendTime > 20) { // 50fps 節流
        lastSendTime = now;
        if (currentTool === 'laser') {
          sendCmd({ type: 'laser', x: x, y: y, active: true });
        } else {
          sendCmd({ type: 'draw', state: 'move', x: x, y: y, color: '#f4b53a' });
        }
      }
    } else if (state === 'end') {
      isTouching = false;
      touchDot.style.display = 'none';
      padHint.style.display = 'block';

      if (currentTool === 'laser') {
        sendCmd({ type: 'laser', active: false });
      } else {
        sendCmd({ type: 'draw', state: 'end', x: x, y: y });
      }
    }
  }

  touchpad.addEventListener('touchstart', function(e) { handleTouch(e, 'start'); }, { passive: false });
  touchpad.addEventListener('touchmove', function(e) { handleTouch(e, 'move'); }, { passive: false });
  touchpad.addEventListener('touchend', function(e) { handleTouch(e, 'end'); }, { passive: false });
  touchpad.addEventListener('touchcancel', function(e) { handleTouch(e, 'end'); }, { passive: false });

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
        version: '1.2.0',
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
