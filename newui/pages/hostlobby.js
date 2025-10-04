
/*! pages/hostlobby.js — v49.h2 */
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
    if (st.status && String(st.status).toLowerCase() === 'ended') return false;
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
    // Leave SPA and reveal legacy host room
    leavePageMode();
    showById('hostSection'); hideById('homeSection'); hideById('joinSection');
    // Try to nudge legacy UI to refresh if it exposes hooks
    try{ if (typeof global.__ms_refreshRoom === 'function') global.__ms_refreshRoom(); }catch(_){}
    try{ if (typeof global.refreshRoom === 'function') global.refreshRoom(); }catch(_){}
    // Align hash to any legacy logic that may look at it
    try{ location.hash = 'host'; }catch(_){}
    // Scroll into view
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
      '  <div class="row" style="gap:8px;margin-bottom:12px">',
      '    <button id="hlCreate" class="btn primary">Create Game</button>',
      '  </div>',
      '  <div id="hlInfo" class="card hidden" style="padding:12px">',
      '    <div class="row" style="align-items:center;gap:8px">',
      '      <strong>Game Code:</strong> <span id="hlGameCode" class="mono">—</span>',
      '      <button id="hlCopy" class="btn" title="Copy">📋</button>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('');

    const btn = el.querySelector('#hlCreate');
    const info = el.querySelector('#hlInfo');
    const outCode = el.querySelector('#hlGameCode');
    const copyBtn = el.querySelector('#hlCopy');

    function showRunning(code){
      outCode.textContent = code || '—';
      info.classList.remove('hidden');
      btn.textContent = 'Go to Game Room';
      btn.classList.remove('primary');
      btn.onclick = function(){ goToLegacyRoom(); };
    }

    // If a game is already running for the host, reflect it immediately
    if (isGameRunning(st)){
      showRunning(st.gameCode);
    }

    copyBtn.addEventListener('click', function(){
      const code = (outCode.textContent || '').trim();
      if (code && code !== '—') copyToClipboard(code);
    });

    btn.addEventListener('click', async function(){
      // If already in "Go to Game Room" mode, just go
      if (/Go to Game Room/i.test(btn.textContent)) { goToLegacyRoom(); return; }

      // If a game is already running, do not create a new one
      const cur = global.state || {};
      if (isGameRunning(cur)){
        showRunning(cur.gameCode);
        return;
      }

      // Create new game through legacy flow
      btn.disabled = true; btn.textContent = 'Creating...';
      const ok = await triggerLegacyCreate();
      if (!ok){
        btn.disabled = false; btn.textContent = 'Create Game';
        alert('Create action is unavailable in this build.');
        return;
      }
      const res = await waitForStateGame(10000);
      btn.disabled = false;
      if (res && res.code){
        showRunning(res.code);
      } else {
        btn.textContent = 'Create Game';
        alert('Could not confirm the new game. Please try again.');
      }
    }, false);
  };
})(window, document);
