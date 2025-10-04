
/*! pages/hostlobby.js — v49.h5 */
(function (global, d) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.screens = App.screens || {};

  function $(id){ return d.getElementById(id); }
  function showById(id){ const n=$(id); if(n){ n.classList.remove('hidden'); n.style.display=''; } }
  function hideById(id){ const n=$(id); if(n){ n.classList.add('hidden'); n.style.display='none'; } }

  function ensureRoot(){
    let el = $('spa-root');
    if (!el) { el = d.createElement('div'); el.id='spa-root'; d.body.appendChild(el); }
    el.removeAttribute('hidden');
    return el;
  }
  function leavePageMode(){
    const root = $('spa-root'); if (root) root.setAttribute('hidden','');
  }

  function getState(){ return global.state || {}; }

  function isGameRunning(st){
    if (!st) return false;
    if (!st.gameId || !st.gameCode) return false;
    const s = (st.status || '').toString().toLowerCase();
    if (s === 'ended' || s === 'cancelled') return false;
    try{
      if (st.endsAt){
        const ends = new Date(st.endsAt).getTime();
        if (!isNaN(ends) && ends < Date.now()) return false;
      }
    }catch(_){}
    return true;
  }

  function triggerLegacyCreate(){
    try{
      const btn = d.getElementById('createGameBtn');
      if (btn && typeof btn.click === 'function') { btn.click(); return true; }
    }catch(_){}
    return false;
  }
  function triggerLegacyEnterHost(){
    try {
      const hostBtn = (global.els && global.els.hostBtn) || d.getElementById('hostBtn');
      if (hostBtn && typeof hostBtn.click === 'function') { hostBtn.click(); return true; }
    } catch(_){}
    showById('hostSection'); hideById('homeSection'); hideById('joinSection');
    return false;
  }
  function triggerLegacyEndGame(){
    try{
      const endBtn = d.getElementById('endAnalyzeBtn');
      if (endBtn && typeof endBtn.click === 'function') { endBtn.click(); return true; }
    }catch(_){}
    return false;
  }

  function copyToClipboard(text){
    if (!text) return;
    try{ navigator.clipboard && navigator.clipboard.writeText(text); }
    catch(_){
      const ta = d.createElement('textarea'); ta.value=text; d.body.appendChild(ta);
      ta.select(); d.execCommand && d.execCommand('copy'); d.body.removeChild(ta);
    }
  }

  function waitForStateGame(timeoutMs){
    return new Promise((resolve)=>{
      const t0 = Date.now();
      (function tick(){
        const st = getState();
        if (st && st.gameCode){
          resolve({ id: st.gameId || null, code: st.gameCode, status: st.status || null, endsAt: st.endsAt || null });
          return;
        }
        if (Date.now() - t0 > timeoutMs) resolve(null);
        else setTimeout(tick, 300);
      })();
    });
  }

  function render(el){
    el.innerHTML = [
      '<section class="p-4 max-w-2xl mx-auto">',
      '  <h2 class="text-2xl" style="font-weight:700;margin:4px 0 16px 0;">Get Ready</h2>',
      '  <div id="hlRunning" class="card hidden" style="padding:12px;margin-bottom:12px">',
      '    <div>There is a game running.</div>',
      '    <div class="row" style="align-items:center;gap:8px;margin-top:8px">',
      '      <strong>Game Code:</strong> <span id="hlGameCodeR" class="mono">—</span>',
      '      <button id="hlCopyR" class="btn" title="Copy">📋</button>',
      '    </div>',
      '    <div class="row" style="gap:8px;margin-top:10px">',
      '      <button id="hlGoRoomR" class="btn primary">Go to Game Room</button>',
      '      <button id="hlEndR" class="btn">End Game</button>',
      '    </div>',
      '  </div>',
      '  <div id="hlCreateWrap">',
      '    <div class="row" style="gap:8px;margin-bottom:12px">',
      '      <button id="hlCreate" class="btn primary">Create Game</button>',
      '    </div>',
      '    <div id="hlInfo" class="card hidden" style="padding:12px">',
      '      <div class="row" style="align-items:center;gap:8px">',
      '        <strong>Game Code:</strong> <span id="hlGameCode" class="mono">—</span>',
      '        <button id="hlCopy" class="btn" title="Copy">📋</button>',
      '      </div>',
      '      <div class="row" style="gap:8px;margin-top:10px">',
      '        <button id="hlGoRoom" class="btn">Go to Game Room</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('');
  }

  function wire(el){
    const runningBox = el.querySelector('#hlRunning');
    const outCodeR = el.querySelector('#hlGameCodeR');
    const copyR = el.querySelector('#hlCopyR');
    const goR = el.querySelector('#hlGoRoomR');
    const endR = el.querySelector('#hlEndR');

    const createBtn = el.querySelector('#hlCreate');
    const info = el.querySelector('#hlInfo');
    const outCode = el.querySelector('#hlGameCode');
    const copyBtn = el.querySelector('#hlCopy');
    const goBtn = el.querySelector('#hlGoRoom');

    function showRunning(code){
      outCodeR.textContent = code || '—';
      runningBox.classList.remove('hidden');
      const wrap = el.querySelector('#hlCreateWrap'); if (wrap) wrap.classList.add('hidden');
    }
    function goToLegacyRoom(){
      leavePageMode();
      triggerLegacyEnterHost();
      try{ location.hash = 'host'; }catch(_){}
      try{ $('hostSection')?.scrollIntoView({ behavior:'smooth', block:'start' }); }catch(_){}
    }

    // If a game is running, reflect it immediately
    const stNow = getState();
    if (isGameRunning(stNow)){
      showRunning(stNow.gameCode);
    }

    // Handlers
    copyR.addEventListener('click', function(){
      const c = (outCodeR.textContent || '').trim();
      if (c && c !== '—') copyToClipboard(c);
    });
    goR.addEventListener('click', goToLegacyRoom);
    endR.addEventListener('click', function(){
      if (!confirm('End the current game?')) return;
      const ok = triggerLegacyEndGame();
      if (!ok) alert('End action unavailable in this build.');
    });

    copyBtn.addEventListener('click', function(){
      const c = (outCode.textContent || '').trim();
      if (c && c !== '—') copyToClipboard(c);
    });
    goBtn.addEventListener('click', goToLegacyRoom);

    createBtn.addEventListener('click', async function(){
      // If a game already exists, do not attempt to create again
      const cur = getState();
      if (isGameRunning(cur)){
        showRunning(cur.gameCode);
        return;
      }
      createBtn.disabled = true; createBtn.textContent = 'Creating...';
      const ok = triggerLegacyCreate();
      if (!ok){
        createBtn.disabled = false; createBtn.textContent = 'Create Game';
        alert('Create action is unavailable in this build.');
        return;
      }
      const res = await waitForStateGame(10000);
      createBtn.disabled = false;

      // If we got a code, show it. If not, but state shows a running game, treat it as running.
      const latest = getState();
      if ((res && res.code) || isGameRunning(latest)){
        const code = (res && res.code) ? res.code : latest.gameCode;
        outCode.textContent = code || '—';
        info.classList.remove('hidden');
        return;
      }

      // True failure
      createBtn.textContent = 'Create Game';
      alert('Could not confirm the new game. Please try again.');
    }, false);
  }

  App.screens.hostLobby = function(el){
    // Ensure container exists and is visible
    const mount = el || ensureRoot();
    // Do NOT return before rendering, even if not logged in, so we never show blank
    // The account/login redirect will happen after the first paint
    render(mount);
    // Auth check after first paint
    const s = getState();
    const session = s && s.session;
    if (!session || !(session.access_token || (session.user && session.user.id))){
      try { sessionStorage.setItem('ms_return_to', '/host'); } catch(_){}
      location.hash = '/account/login';
      return;
    }
    wire(mount);
  };
})(window, document);
