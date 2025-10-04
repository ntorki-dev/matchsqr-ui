
/*! pages/hostlobby.js — v49.h7 (stable render + solid "Go to Room") */
(function (global, d) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.screens = App.screens || {};

  // ---------- tiny utils ----------
  const $ = (id)=> d.getElementById(id);
  const showEl = (el)=> { if (el) { el.classList.remove('hidden'); el.style.display = ''; } };
  const hideEl = (el)=> { if (el) { el.classList.add('hidden'); el.style.display = 'none'; } };

  function ensureSpaRoot() {
    let el = $('spa-root');
    if (!el) { el = d.createElement('div'); el.id = 'spa-root'; d.body.appendChild(el); }
    el.removeAttribute('hidden');
    return el;
  }
  function state(){ return global.state || {}; }
  function hasSession() {
    const s = state().session;
    return !!(s && (s.access_token || (s.user && s.user.id)));
  }
  function isRunning(st) {
    if (!st) return false;
    if (!st.gameCode) return false;
    const s = (st.status || '').toString().toLowerCase();
    if (s === 'ended' || s === 'cancelled') return false;
    if (st.endsAt) {
      const t = new Date(st.endsAt).getTime();
      if (!isNaN(t) && t < Date.now()) return false;
    }
    return true;
  }
  function copyText(text){
    if (!text) return;
    try { navigator.clipboard?.writeText(text); }
    catch {
      const ta = d.createElement('textarea'); ta.value = text; d.body.appendChild(ta);
      ta.select(); d.execCommand && d.execCommand('copy'); d.body.removeChild(ta);
    }
  }
  function triggerLegacyCreate(){
    const btn = $('createGameBtn');
    if (btn && typeof btn.click === 'function') { btn.click(); return true; }
    return false;
  }
  function waitForGameCode(ms){
    return new Promise(resolve=>{
      const start = Date.now();
      (function poll(){
        const st = state();
        if (st && st.gameCode) return resolve(st.gameCode);
        if (Date.now() - start >= ms) return resolve(null);
        setTimeout(poll, 250);
      })();
    });
  }

  // Enter the legacy host room reliably
  function enterLegacyHostRoom() {
    // 1) Try the real Host button to execute your original init
    try {
      const hostBtn = (global.els && global.els.hostBtn) || $('hostBtn');
      if (hostBtn && typeof hostBtn.click === 'function') {
        hostBtn.click();
      } else {
        // 2) Fallback: switch sections the same way legacy code does
        const home = $('homeSection'), host = $('hostSection'), join = $('joinSection');
        if (home) hideEl(home);
        if (join) hideEl(join);
        if (host) showEl(host);
      }
    } catch {}

    // 3) Align hash for any legacy observers
    try { location.hash = 'host'; } catch {}

    // 4) Optional refresh hooks if exposed
    try { if (typeof global.__ms_refreshRoom === 'function') global.__ms_refreshRoom(); } catch {}
    try { if (typeof global.refreshRoom === 'function') global.refreshRoom(); } catch {}

    // 5) Ensure the SPA container hides so the room is fully visible
    const root = $('spa-root'); if (root) root.setAttribute('hidden', '');
  }

  function renderShell(el){
    el.innerHTML = [
      '<section class="p-4 max-w-2xl mx-auto">',
      '  <h2 class="text-2xl" style="font-weight:700;margin:4px 0 16px 0;">Get Ready</h2>',
      '  <div id="createWrap" class="row" style="gap:8px;margin-bottom:12px">',
      '    <button id="btnCreate" class="btn primary">Create Game</button>',
      '  </div>',
      '  <div id="runningWrap" class="card hidden" style="padding:12px">',
      '    <div class="row" style="align-items:center;gap:8px">',
      '      <strong>Game Code:</strong> <span id="codeOut" class="mono">—</span>',
      '      <button id="btnCopy" class="btn" title="Copy">📋</button>',
      '    </div>',
      '    <div class="row" style="gap:8px;margin-top:10px">',
      '      <button id="btnGoRoom" class="btn">Go to Game Room</button>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('');
  }

  App.screens.hostLobby = async function(el){
    // Always render shell first so it's never blank
    const mount = el || ensureSpaRoot();
    renderShell(mount);

    // Hide legacy sections while in the lobby
    try{
      const H = $('homeSection'), HS = $('hostSection'), JS = $('joinSection');
      if (H) H.style.display = 'none';
      if (HS) HS.style.display = 'none';
      if (JS) JS.style.display = 'none';
    }catch{}

    // After first paint, guard auth
    if (!hasSession()) {
      try { sessionStorage.setItem('ms_return_to', '/host'); } catch {}
      location.hash = '/account/login';
      return;
    }

    // Wire elements
    const createWrap = $('createWrap');
    const btnCreate  = $('btnCreate');
    const runningWrap= $('runningWrap');
    const codeOut    = $('codeOut');
    const btnCopy    = $('btnCopy');
    const btnGoRoom  = $('btnGoRoom');

    const showCreateOnly = ()=>{ showEl(createWrap); hideEl(runningWrap); };
    const showRunningOnly = (code)=>{ codeOut.textContent = code || '—'; hideEl(createWrap); showEl(runningWrap); };

    // Initial: pick ONE view based on live state
    const st = state();
    if (isRunning(st)) showRunningOnly(st.gameCode);
    else showCreateOnly();

    // Copy + Go handlers
    btnCopy.addEventListener('click', ()=> copyText(codeOut.textContent.trim()));
    btnGoRoom.addEventListener('click', enterLegacyHostRoom);

    // Create flow
    btnCreate.addEventListener('click', async ()=>{
      // If something started already, just show running
      if (isRunning(state())) { showRunningOnly(state().gameCode); return; }

      btnCreate.disabled = true; btnCreate.textContent = 'Creating...';
      const ok = triggerLegacyCreate();
      if (!ok) {
        btnCreate.disabled = false; btnCreate.textContent = 'Create Game';
        alert('Create action is unavailable in this build.');
        return;
      }
      const code = await waitForGameCode(12000);
      btnCreate.disabled = false;
      if (code) {
        showRunningOnly(code);
      } else {
        // If the state flipped to running but we missed the exact code, accept the current snapshot
        if (isRunning(state())) {
          showRunningOnly(state().gameCode);
        } else {
          btnCreate.textContent = 'Create Game';
          alert('Could not confirm the new game. Please try again.');
        }
      }
    });
  };
})(window, document);
