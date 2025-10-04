
/*! pages/hostlobby.js — v49.h3 */
(function (global, d) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.screens = App.screens || {};

  function $(id){ return d.getElementById(id); }
  function showById(id){ const n=$(id); if(n){ n.classList.remove('hidden'); n.style.display=''; } }
  function hideById(id){ const n=$(id); if(n){ n.classList.add('hidden'); n.style.display='none'; } }

  function enterPageMode(){
    hideById('homeSection'); hideById('hostSection'); hideById('joinSection');
    const root = $('spa-root') || (function(){ const div=d.createElement('div'); div.id='spa-root'; d.body.appendChild(div); return div; })();
    root.removeAttribute('hidden');
    window.scrollTo(0,0);
  }
  function leavePageMode(){
    const root = $('spa-root'); if (root) root.setAttribute('hidden','');
  }

  function getAuth(){
    const s = global.state || {};
    return { supa: s.supa || null, session: s.session || null };
  }

  // Reuse the existing backend flow by triggering the legacy hidden "Create Game" button
  async function triggerLegacyCreate(){
    const btn = d.getElementById('createGameBtn');
    if (btn) { btn.click(); return true; }
    return false;
  }

  function triggerLegacyEnterHost(){
    // Prefer clicking the original Host button so all original init code runs
    try {
      const hostBtn = (global.els && global.els.hostBtn) || d.getElementById('hostBtn');
      if (hostBtn && typeof hostBtn.click === 'function') {
        hostBtn.click();
        return true;
      }
    } catch(_){}
    // Fallback to show/hide
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

  function waitForStateGame(timeoutMs){
    return new Promise((resolve)=>{
      const t0 = Date.now();
      (function tick(){
        const st = global.state || {};
        if (st && st.gameCode){
          resolve({ id: st.gameId || null, code: st.gameCode, status: st.status || null, endsAt: st.endsAt || null });
          return;
        }
        if (Date.now() - t0 > timeoutMs) resolve(null);
        else setTimeout(tick, 250);
      })();
    });
  }

  function copyToClipboard(text){
    if (!text) return;
    try{ navigator.clipboard && navigator.clipboard.writeText(text); }
    catch(_){
      const ta = d.createElement('textarea'); ta.value=text; d.body.appendChild(ta);
      ta.select(); d.execCommand && d.execCommand('copy'); d.body.removeChild(ta);
    }
  }

  function isGameRunning(st){
    if (!st) return false;
    if (!st.gameId || !st.gameCode) return false;
    const ended = st.status && String(st.status).toLowerCase() === 'ended';
    if (ended) return false;
    try{
      if (st.endsAt){
        const now = Date.now();
        const ends = new Date(st.endsAt).getTime();
        if (!isNaN(ends) && ends < now) return false;
      }
    }catch(_){}
    return true;
  }

  function goToLegacyRoom(){
    leavePageMode();
    triggerLegacyEnterHost();
    try{ location.hash = 'host'; }catch(_){}
    try{ $('hostSection')?.scrollIntoView({ behavior:'smooth', block:'start' }); }catch(_){}
  }

  App.screens.hostLobby = async function(el){
    enterPageMode();

    // Auth guard
    const { session } = getAuth();
    if (!session || !session.access_token){
      try { sessionStorage.setItem('ms_return_to', '/host'); } catch(_){}
      location.hash = '/account/login';
      return;
    }

    // Current state snapshot
    const st = global.state || {};

    // Render shell
    el.innerHTML = [
      '<section class="p-4 max-w-2xl mx-auto">',
      '  <h2 class="text-2xl" style="font-weight:700;margin:4px 0 16px 0;">Get Ready</h2>',
      '  <div id="hlRunning" class="card hidden" style="padding:12px;margin-bottom:12px">',
      '    <div class="row" style="align-items:center;gap:8px">There is a game running.</div>',
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

    // Elements
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
      // hide create flow when a game is running
      const wrap = el.querySelector('#hlCreateWrap'); if (wrap) wrap.classList.add('hidden');
    }

    // If a game is already running for the host, reflect it and auto-redirect to the room
    if (isGameRunning(st)){
      showRunning(st.gameCode);
      // small delay so user sees status, then go to room
      setTimeout(goToLegacyRoom, 200);
    }

    // Handlers for running game
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

    // Create flow
    copyBtn.addEventListener('click', function(){
      const code = (outCode.textContent || '').trim();
      if (code && code !== '—') copyToClipboard(code);
    });
    goBtn.addEventListener('click', goToLegacyRoom);

    createBtn.addEventListener('click', async function(){
      // Prevent creating when running
      const cur = global.state || {};
      if (isGameRunning(cur)){
        showRunning(cur.gameCode);
        setTimeout(goToLegacyRoom, 100);
        return;
      }
      createBtn.disabled = true; createBtn.textContent = 'Creating...';
      const ok = await triggerLegacyCreate();
      if (!ok){
        createBtn.disabled = false; createBtn.textContent = 'Create Game';
        alert('Create action is unavailable in this build.');
        return;
      }
      const res = await waitForStateGame(10000);
      createBtn.disabled = false;
      if (res && res.code){
        outCode.textContent = res.code;
        info.classList.remove('hidden');
      } else {
        createBtn.textContent = 'Create Game';
        alert('Could not confirm the new game. Please try again.');
      }
    }, false);
  };
})(window, document);
