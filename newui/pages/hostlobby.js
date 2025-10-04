
/*! pages/hostlobby.js — v49.h1 */
(function (global) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.screens = App.screens || {};

  function $(id){ return document.getElementById(id); }
  function showById(id){ const n=$(id); if(n) n.style.display=''; }
  function hideById(id){ const n=$(id); if(n) n.style.display='none'; }

  function enterPageMode(){
    // Hide legacy sections and show SPA container
    hideById('homeSection'); hideById('hostSection'); hideById('joinSection');
    const root = $('spa-root') || (function(){ const d=document.createElement('div'); d.id='spa-root'; document.body.appendChild(d); return d; })();
    root.removeAttribute('hidden');
    window.scrollTo(0,0);
  }
  function leavePageMode(){
    showById('homeSection'); hideById('hostSection'); hideById('joinSection');
    const root = $('spa-root'); if (root) root.setAttribute('hidden','');
  }

  // Return Supabase + session
  function getAuth(){
    const s = global.state || {};
    return { supa: s.supa || null, session: s.session || null };
  }

  // Reuse legacy "Create Game" logic by triggering the existing hidden button if available.
  async function triggerLegacyCreate(){
    const btn = document.getElementById('createGameBtn');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }

  function waitForHostGame(timeoutMs){
    return new Promise((resolve)=>{
      const t0 = Date.now();
      const tick = ()=>{
        const st = global.state || {};
        if (st.gameId && st.gameCode){
          resolve({ id: st.gameId, code: st.gameCode });
          return;
        }
        if (Date.now() - t0 > timeoutMs) resolve(null);
        else setTimeout(tick, 300);
      };
      tick();
    });
  }

  function copyToClipboard(text){
    try {
      navigator.clipboard && navigator.clipboard.writeText(text).then(()=>{});
    } catch(_) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
  }

  App.screens.hostLobby = async function(el){
    enterPageMode();

    // Auth gate: if not logged in, remember return-to and send to login
    const { session } = getAuth();
    if (!session || !session.access_token){
      try { sessionStorage.setItem('ms_return_to', '/host'); } catch(_){}
      location.hash = '/account/login';
      return;
    }

    // Render UI
    el.innerHTML = [
      '<section class="p-4 max-w-2xl mx-auto">',
      '  <h2 class="text-2xl" style="font-weight:700;margin:4px 0 16px 0;">Get Ready</h2>',
      '  <div class="row" style="gap:8px;margin-bottom:12px">',
      '    <button id="hlCreate" class="btn primary">Create Game</button>',
      '  </div>',
      '  <div id="hlInfo" class="card hidden" style="padding:12px">',
      '    <div class="row" style="align-items:center;gap:8px">',
      '      <strong>Game ID:</strong> <span id="hlGameId" class="mono">—</span>',
      '      <button id="hlCopy" class="btn" title="Copy">📋</button>',
      '    </div>',
      '    <div style="margin-top:8px"><strong>Code:</strong> <span id="hlGameCode" class="mono">—</span></div>',
      '  </div>',
      '</section>'
    ].join('');

    const btn = el.querySelector('#hlCreate');
    const info = el.querySelector('#hlInfo');
    const outId = el.querySelector('#hlGameId');
    const outCode = el.querySelector('#hlGameCode');
    const copyBtn = el.querySelector('#hlCopy');

    function revealInfo(id, code){
      outId.textContent = id || '—';
      outCode.textContent = code || '—';
      info.classList.remove('hidden');
      btn.textContent = 'Go to Game Room';
      btn.classList.remove('primary');
      btn.onclick = function(){
        // Leave SPA and show legacy host room
        leavePageMode();
        // Show legacy host section
        showById('hostSection');
        hideById('homeSection'); hideById('joinSection');
        // Optionally scroll into view
        document.getElementById('hostSection')?.scrollIntoView({ behavior:'smooth', block:'start' });
      };
    }

    copyBtn.addEventListener('click', function(){
      const text = (outId.textContent || '').trim();
      if (text && text !== '—') copyToClipboard(text);
    });

    btn.addEventListener('click', async function(){
      // If button already turned into "Go to Game Room"
      if (btn.textContent && /Go to Game Room/i.test(btn.textContent)) {
        btn.onclick && btn.onclick();
        return;
      }
      btn.disabled = true; btn.textContent = 'Creating...';
      // Reuse existing logic without duplicating backend calls
      const ok = await triggerLegacyCreate();
      if (!ok){
        // Fallback: show message
        btn.disabled = false; btn.textContent = 'Create Game';
        alert('Create action is unavailable in this build.'); 
        return;
      }
      // Wait for state to be populated by legacy logic
      const res = await waitForHostGame(8000);
      btn.disabled = false;
      if (res && res.id && res.code){
        revealInfo(res.id, res.code);
      } else {
        btn.textContent = 'Create Game';
        alert('Could not confirm the new game. Please try again.');
      }
    }, { once:false });
  };
})(window);
