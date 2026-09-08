// /live（觀眾，手機直向）與 /stage（講者外框，橫向）共用這一支。
// 靠 location.pathname 分模式,側欄與留言的程式碼只寫一次。
export const AUDIENCE_HTML = `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>直播互動</title>
<style>
  :root {
    --bg:#0d0c0a; --surface:#1a1712; --surface-2:#262118; --border:#332d20;
    --amber:#f4b53a; --cyan:#22d3ee; --cream:#f3efe6; --muted:#8c846f;
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  html,body { height:100%; height:100dvh; background:var(--bg); color:var(--cream);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC",sans-serif; overflow:hidden; }
  body { display:flex; flex-direction:column; }

  /* 版面:live 直向上下切,stage 橫向左右切 */
  #wrap { flex:1 1 0%; min-height:0; display:flex; flex-direction:column; }
  body.stage #wrap { flex-direction:row; }

  #stagearea { position:relative; background:#000; flex-shrink:0; aspect-ratio:16/9; width:100%; }
  body.stage #stagearea { flex:1 1 0%; width:auto; height:100%; aspect-ratio:auto;
    display:flex; align-items:center; justify-content:center; }
  #deck { width:100%; height:100%; border:0; display:block; }
  body.stage #deck { aspect-ratio:16/9; width:100%; height:auto; max-height:100%; }
  #waiting { position:absolute; inset:0; display:none; flex-direction:column; gap:1rem;
    align-items:center; justify-content:center; text-align:center; padding:1rem; }
  #waiting.on { display:flex; }
  #waiting .big { font-size:1.1rem; font-weight:700; color:var(--amber); }
  #waiting .sub { font-size:.82rem; color:var(--muted); line-height:1.6; }
  #waitqr { width:min(46vh,300px); background:#fff; padding:10px; border-radius:12px; }
  #waitqr svg, #waitqr img { display:block; width:100%; height:auto; }

  aside { display:flex; flex-direction:column; min-height:0; flex:1 1 0%;
    background:var(--surface); border-top:1px solid var(--border); }
  body.stage aside { flex:0 0 22%; min-width:250px; border-top:0; border-left:1px solid var(--border); }
  body.stage.folded aside { display:none; }

  .side-head { flex-shrink:0; padding:.5rem .7rem; border-bottom:1px solid var(--border);
    display:flex; align-items:center; gap:.5rem; justify-content:space-between; }
  #qrbox { display:none; background:#fff; padding:6px; border-radius:8px; width:104px; flex-shrink:0; }
  body.stage #qrbox { display:block; }
  #qrbox svg, #qrbox img { display:block; width:100%; height:auto; }
  #joinurl { display:none; font-size:.66rem; color:var(--muted); word-break:break-all; line-height:1.4; }
  body.stage #joinurl { display:block; }
  .presence { font-size:.78rem; color:var(--muted); display:flex; align-items:center; gap:.3rem; white-space:nowrap; }
  .dot { width:7px; height:7px; border-radius:50%; background:#ef4444; flex-shrink:0; }
  .dot.on { background:#22c55e; }
  #me { background:none; border:1px solid var(--border); color:var(--cream); font:inherit;
    font-size:.74rem; padding:.24rem .5rem; border-radius:999px; cursor:pointer; }
  body.stage #me { display:none; }

  /* 五顆計數 */
  #counts { flex-shrink:0; display:grid; grid-template-columns:repeat(3,1fr); gap:.4rem; padding:.6rem .7rem; }
  body.stage #counts { grid-template-columns:repeat(2,1fr); }
  .chip { position:relative; background:var(--surface-2); border:1px solid var(--border); color:var(--cream);
    border-radius:10px; padding:.55rem .3rem; font:inherit; font-size:.8rem; font-weight:700;
    cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:.15rem;
    touch-action:manipulation; transition:transform .08s; }
  body.stage .chip { cursor:default; }
  .chip:active { transform:scale(.94); }
  .chip .n { font-size:1.05rem; color:var(--amber); font-variant-numeric:tabular-nums; }
  .chip.on { background:var(--amber); color:#12100c; border-color:var(--amber); }
  .chip.on .n { color:#12100c; }
  .chip.warm .n { color:var(--cyan); }

  /* 留言牆 */
  #wall { flex:1 1 0%; min-height:0; overflow-y:auto; padding:0 .7rem .5rem;
    display:flex; flex-direction:column; gap:.4rem; -webkit-overflow-scrolling:touch; }
  .cm { background:var(--surface-2); border:1px solid var(--border); border-radius:8px;
    padding:.45rem .55rem; font-size:.84rem; line-height:1.5; display:flex; gap:.5rem; align-items:flex-start; }
  .cm .body { flex:1 1 0%; min-width:0; }
  .cm .who { font-size:.7rem; color:var(--amber); font-weight:700; }
  .cm.q { border-left:3px solid var(--cyan); }
  .cm.q .who::after { content:" · 問題"; color:var(--cyan); }
  .cm.answered { opacity:.4; }
  .cm.answered .txt { text-decoration:line-through; }
  .cm .txt { word-break:break-word; white-space:pre-wrap; }
  .like { background:none; border:1px solid var(--border); color:var(--muted); font:inherit;
    font-size:.72rem; border-radius:999px; padding:.15rem .45rem; cursor:pointer; flex-shrink:0;
    font-variant-numeric:tabular-nums; }
  .like.on { background:var(--amber); color:#12100c; border-color:var(--amber); }
  #empty { color:var(--muted); font-size:.8rem; text-align:center; padding:1.2rem .5rem; line-height:1.7; }

  /* 輸入列 */
  #say { flex-shrink:0; display:flex; gap:.4rem; padding:.5rem .7rem;
    padding-bottom:max(.5rem,calc(env(safe-area-inset-bottom) + .2rem));
    border-top:1px solid var(--border); align-items:center; }
  body.stage #say { display:none; }
  #text { flex:1 1 0%; min-width:0; background:var(--surface-2); border:1px solid var(--border);
    color:var(--cream); font:inherit; font-size:.88rem; padding:.5rem .6rem; border-radius:8px; }
  #qflag { background:var(--surface-2); border:1px solid var(--border); color:var(--muted);
    font:inherit; font-size:.72rem; padding:.5rem .5rem; border-radius:8px; cursor:pointer; flex-shrink:0; }
  #qflag.on { background:var(--cyan); color:#0d0c0a; border-color:var(--cyan); }
  #send { background:var(--amber); color:#12100c; border:0; font:inherit; font-weight:700;
    font-size:.88rem; padding:.5rem .8rem; border-radius:8px; cursor:pointer; flex-shrink:0; }

  /* 飛出來的反應 */
  #bursts { position:fixed; inset:0; pointer-events:none; overflow:hidden; z-index:9; }
  .fly { position:absolute; bottom:14%; font-size:1.5rem; animation:fly 2.2s ease-out forwards; }
  @keyframes fly {
    0% { opacity:0; transform:translateY(0) scale(.5); }
    12% { opacity:1; transform:translateY(-14px) scale(1.15); }
    100% { opacity:0; transform:translateY(-46vh) scale(.85); }
  }
  #foldhint { display:none; }
  body.stage #foldhint { display:block; position:fixed; right:6px; bottom:4px;
    font-size:.6rem; color:var(--muted); z-index:10; }
</style>
</head>
<body>
<div id="wrap">
  <div id="stagearea">
    <iframe id="deck" allow="fullscreen; autoplay" allowfullscreen></iframe>
    <div id="waiting">
      <div id="waitqr"></div>
      <div class="big">即將開始</div>
      <div class="sub">掃描上面的 QR Code 加入互動<br>留言跟按鈕現在就可以用</div>
    </div>
  </div>

  <aside>
    <div class="side-head">
      <div id="qrbox"></div>
      <div style="flex:1 1 0%;min-width:0">
        <div class="presence"><span class="dot" id="dot"></span><span id="pres">連線中</span></div>
        <div id="joinurl"></div>
      </div>
      <button id="me" type="button">我</button>
    </div>

    <div id="counts">
      <button class="chip" data-pace="faster" type="button"><span class="n" id="n-faster">0</span>快一點</button>
      <button class="chip" data-pace="slower" type="button"><span class="n" id="n-slower">0</span>慢一點</button>
      <button class="chip" data-pace="lost" type="button"><span class="n" id="n-lost">0</span>聽不懂</button>
      <button class="chip warm" data-react="like" type="button"><span class="n" id="n-like">0</span>喜歡</button>
      <button class="chip warm" data-react="agree" type="button"><span class="n" id="n-agree">0</span>同意</button>
    </div>

    <div id="wall"><div id="empty">還沒有人留言<br>第一句話交給你</div></div>

    <form id="say">
      <input id="text" maxlength="200" placeholder="說點什麼…" autocomplete="off">
      <button id="qflag" type="button" title="標記成問題,講者會回答">問題</button>
      <button id="send" type="submit">送出</button>
    </form>
  </aside>
</div>
<div id="bursts"></div>
<div id="foldhint">按 S 收合側欄</div>

<script>
(function(){
  var qs = new URLSearchParams(location.search);
  var room = qs.get('room') || 'wed';
  var deckUrl = qs.get('deck') || '';
  var isStage = location.pathname.indexOf('/stage') === 0;
  document.body.className = isStage ? 'stage' : 'live';

  // ---- 身分:可愛代號存 localStorage,撞名不影響計數(去重全在伺服器用連線編號)
  var ADJ = ['編織','打盹','迷路','碎念','發光','慢慢','偷偷','暖呼呼','圓滾滾','毛茸茸','安靜','好奇',
             '認真','悠哉','蓬鬆','眨眼','嘴饞','晃來晃去','躡手躡腳','曬太陽','看星星','寫程式','愛下雨','找路'];
  var ANI = ['小熊','水獺','柴犬','貓頭鷹','海豹','刺蝟','企鵝','樹懶','狐狸','兔子','浣熊','鯨魚',
             '山羌','藍鵲','石虎','穿山甲','海龜','羊駝','鴨嘴獸','長頸鹿','章魚','螢火蟲','土撥鼠','柯基'];
  function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
  var me = '';
  try { me = localStorage.getItem('deck_live_name') || ''; } catch(e) {}
  if (!me) { me = pick(ADJ)+pick(ANI); try { localStorage.setItem('deck_live_name', me); } catch(e) {} }
  var meBtn = document.getElementById('me');
  meBtn.textContent = me;
  // ponytail: 改名用原生 prompt,不做自訂對話框
  meBtn.onclick = function(){
    var v = prompt('你的暱稱（其他人會看到）', me);
    if (v === null) return;
    v = v.trim().slice(0,12);
    if (!v) return;
    me = v; meBtn.textContent = me;
    try { localStorage.setItem('deck_live_name', me); } catch(e) {}
  };

  // ---- 簡報 iframe。/stage 的 iframe 就是講者本人的 host deck,所以不帶 role。
  var deckEl = document.getElementById('deck');
  var waiting = document.getElementById('waiting');
  var joinUrl = location.origin + '/live?room=' + encodeURIComponent(room) +
                (deckUrl ? '&deck=' + encodeURIComponent(deckUrl) : '');
  document.getElementById('joinurl').textContent = joinUrl.replace(/^https?:\\/\\//,'');

  function showWaiting(on){
    waiting.classList.toggle('on', on);
    deckEl.style.visibility = on ? 'hidden' : 'visible';
  }
  function mountDeck(){
    if (!deckUrl) { showWaiting(true); return; }
    var sep = deckUrl.indexOf('?') >= 0 ? '&' : '?';
    deckEl.src = deckUrl + sep + 'room=' + encodeURIComponent(room) + (isStage ? '' : '&role=viewer');
    showWaiting(false);
  }
  if (deckUrl) {
    // GitHub Pages 的 404 也會回一個正常的 HTML 頁,所以要看狀態碼而不是等 onerror。
    // 取不到(CORS/離線)就當它在,直接掛上去。
    fetch(deckUrl, { method:'HEAD', mode:'cors' })
      .then(function(r){ if (r.ok) mountDeck(); else showWaiting(true); })
      .catch(function(){ mountDeck(); });
  } else { showWaiting(true); }

  // ---- QR:先用簡報自己帶的 qrcode.min.js,失敗才退到外部產生器
  function drawQR(el, text, size){
    if (!el) return;
    try {
      var qr = qrcode(0, 'M'); qr.addData(text); qr.make();
      el.innerHTML = qr.createSvgTag(size || 4, 2); return;
    } catch(e) {}
    el.innerHTML = '<img alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=4&data=' +
                   encodeURIComponent(text) + '">';
  }
  function renderQRs(){
    if (isStage) drawQR(document.getElementById('qrbox'), joinUrl, 3);
    drawQR(document.getElementById('waitqr'), joinUrl, 6);
  }
  if (deckUrl) {
    var s = document.createElement('script');
    try { s.src = new URL('qrcode.min.js', deckUrl).href; } catch(e) { s.src = ''; }
    s.onload = renderQRs; s.onerror = renderQRs;
    if (s.src) document.head.appendChild(s); else renderQRs();
  } else { renderQRs(); }

  // ---- 連線
  var ws = null, myPace = null, myLikes = {}, lastPage = null, qOn = false;
  var dot = document.getElementById('dot'), pres = document.getElementById('pres');

  function connect(){
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // stage 這條連線不算進觀眾人數,所以用獨立的 role
    var role = isStage ? 'stage' : 'viewer';
    try { ws = new WebSocket(proto + '//' + location.host + '/ws?room=' + encodeURIComponent(room) + '&role=' + role); }
    catch(e) { setTimeout(connect, 3000); return; }
    ws.onopen = function(){ dot.classList.add('on'); };
    ws.onclose = function(){ dot.classList.remove('on'); pres.textContent = '斷線,重連中'; setTimeout(connect, 3000); };
    ws.onmessage = function(e){
      var m; try { m = JSON.parse(e.data); } catch(err) { return; }
      if (m.type === 'tally') render(m);
    };
  }
  function send(o){ if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

  // ---- 畫面
  var wall = document.getElementById('wall');
  function render(t){
    if (t.page !== lastPage) { lastPage = t.page; myPace = null; }
    pres.textContent = t.viewers + ' 人在線上';
    ['faster','slower','lost'].forEach(function(k){
      document.getElementById('n-'+k).textContent = t.pace[k];
      var b = document.querySelector('[data-pace="'+k+'"]');
      if (b) b.classList.toggle('on', myPace === k);
    });
    ['like','agree'].forEach(function(k){ document.getElementById('n-'+k).textContent = t.reactions[k]; });
    if (t.burst) { fly(t.burst.like, '❤'); fly(t.burst.agree, '✓'); }

    if (!t.comments.length) {
      wall.innerHTML = '<div id="empty">還沒有人留言<br>第一句話交給你</div>';
      return;
    }
    wall.innerHTML = '';
    t.comments.forEach(function(c){
      var d = document.createElement('div');
      d.className = 'cm' + (c.q ? ' q' : '') + (c.answered ? ' answered' : '');
      var b = document.createElement('div'); b.className = 'body';
      var w = document.createElement('div'); w.className = 'who'; w.textContent = c.name;
      var x = document.createElement('div'); x.className = 'txt'; x.textContent = c.text;
      b.appendChild(w); b.appendChild(x); d.appendChild(b);
      var lk = document.createElement('button');
      lk.type = 'button'; lk.className = 'like' + (myLikes[c.id] ? ' on' : '');
      lk.textContent = '+' + c.likes;
      lk.onclick = function(){ myLikes[c.id] = !myLikes[c.id]; send({ type:'like', id:c.id }); };
      d.appendChild(lk);
      // 講者在自己的 stage 上點一則問題就能標記已回答
      if (isStage && c.q && !c.answered) {
        d.style.cursor = 'pointer';
        d.title = '點一下標記成已回答';
        d.onclick = function(ev){ if (ev.target !== lk) send({ type:'answered', id:c.id }); };
      }
      wall.appendChild(d);
    });
  }

  var bursts = document.getElementById('bursts');
  function fly(n, ch){
    if (!n) return;
    for (var i = 0; i < Math.min(n, 8); i++) (function(i){
      setTimeout(function(){
        var e = document.createElement('div');
        e.className = 'fly'; e.textContent = ch;
        e.style.left = (8 + Math.random() * 78) + '%';
        bursts.appendChild(e);
        setTimeout(function(){ e.remove(); }, 2300);
      }, i * 90);
    })(i);
  }

  // ---- 觀眾的操作(stage 不綁)
  if (!isStage) {
    document.querySelectorAll('[data-pace]').forEach(function(b){
      b.onclick = function(){
        var v = b.dataset.pace;
        myPace = (myPace === v) ? null : v;
        send({ type:'pace', v:v });
      };
    });
    var lastReact = 0;
    document.querySelectorAll('[data-react]').forEach(function(b){
      b.onclick = function(){
        var now = Date.now();
        if (now - lastReact < 1000) return;   // 一秒節流,擋連點
        lastReact = now;
        send({ type:'react', v:b.dataset.react });
      };
    });
    var qflag = document.getElementById('qflag');
    qflag.onclick = function(){ qOn = !qOn; qflag.classList.toggle('on', qOn); };
    document.getElementById('say').onsubmit = function(ev){
      ev.preventDefault();
      var el = document.getElementById('text');
      var v = el.value.trim();
      if (!v) return;
      send({ type:'comment', name:me, text:v, q:qOn });
      el.value = ''; qOn = false; qflag.classList.remove('on');
    };
  }

  // stage 收合側欄
  if (isStage) {
    document.addEventListener('keydown', function(e){
      if (e.key === 's' || e.key === 'S') document.body.classList.toggle('folded');
    });
  }

  connect();
})();
</script>
</body>
</html>`
