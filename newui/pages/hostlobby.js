
/*! pages/hostlobby.js — v49.clean */
(function (global) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.screens = App.screens || {};

  function $(id){ return document.getElementById(id); }
  function hide(id){ const n=$(id); if(n){ n.style.display='none'; n.classList.add('hidden'); } }
  function show(id){ const n=$(id); if(n){ n.style.display=''; n.classList.remove('hidden'); } }
  function el(tag, attrs, html){
    const x = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(k=> x.setAttribute(k, attrs[k]));
    if (html!=null) x.innerHTML = html;
    return x;
  }

  function enterPageMode(){
    hide('homeSection'); hide('hostSection'); hide('joinSection');
    let root = $('spa-root'); if (!root){ root = el('div', { id:'spa-root' }); document.body.appendChild(root); }
    root.removeAttribute('hidden'); window.scrollTo(0,0); return root;
  }
  function leavePageMode(){ const root=$('spa-root'); if(root) root.setAttribute('hidden',''); }

  function state(){ return global.state || {}; }
  function session(){ return (state() && state().session) || null; }
  function supa(){ return (state() && state().supa) || null; }

  function copy(text){
    try{ navigator.clipboard.writeText(text); }catch(_){
      const ta = document.createElement('textarea'); ta.value=text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
  }

  async function detectRunningForHost(){
    try{
      const s = session(); const sp = supa();
      if (!s || !sp) return null;
      // Use Supabase to ask for a game for this host that isn't ended
      const uid = s.user && s.user.id;
      if (!uid) return null;
      const q = await sp.from('games')
        .select('id, code, status, ends_at')
        .eq('host_id', uid)
        .in('status', ['created','running'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (q.error) return null;
      const row = (q.data && q.data[0]) || null;
      if (!row) return null;
      return { id: row.id, code: row.code, status: row.status, ends_at: row.ends_at };
    }catch(_){ return null; }
  }

  function goToLegacyHostRoom(){
    leavePageMode();
    try{
      const btn = (global.els && global.els.hostBtn) || document.getElementById('hostBtn');
      if (btn && typeof btn.click === 'function') { btn.click(); return; }
    }catch(_){}
    show('hostSection'); hide('homeSection'); hide('joinSection');
  }

  function renderShell(root){
    root.innerHTML = [
      '<section class="p-4 max-w-2xl mx-auto">',
      '  <h2 class="text-2xl" style="font-weight:700;margin:4px 0 16px 0;">Get Ready</h2>',
      '  <div id="hlRunning" class="card hidden" style="padding:12px;margin-bottom:12px">',
      '    <div>There is a game running.</div>',
      '    <div class="row" style="align-items:center;gap:8px;margin-top:8px">',
      '      <strong>Game Code:</strong> <span id="hlCodeR" class="mono">—</span>',
      '      <button id="hlCopyR" class="btn" title="Copy">📋</button>',
      '    </div>',
      '    <div class="row" style="gap:8px;margin-top:10px">',
      '      <button id="hlGoR" class="btn primary">Go to Game Room</button>',
      '      <button id="hlEndR" class="btn">End Game</button>',
      '    </div>',
      '  </div>',
      '  <div id="hlCreateWrap">',
      '    <button id="hlCreate" class="btn primary">Create Game</button>',
      '    <div id="hlInfo" class="card hidden" style="padding:12px;margin-top:12px">',
      '      <div class="row" style="align-items:center;gap:8px">',
      '        <strong>Game Code:</strong> <span id="hlCode" class="mono">—</span>',
      '        <button id="hlCopy" class="btn" title="Copy">📋</button>',
      '      </div>',
      '      <div class="row" style="gap:8px;margin-top:10px">',
      '        <button id="hlGo" class="btn">Go to Game Room</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('');
  }

  App.screens.hostLobby = async function(root){
    root = enterPageMode();
    renderShell(root);

    const sess = session();
    if (!sess || !sess.access_token){
      try{ sessionStorage.setItem('ms_return_to','/host'); }catch(_){}
      location.hash = '/account/login';
      return;
    }

    const codeOutR = root.querySelector('#hlCodeR');
    const runBox = root.querySelector('#hlRunning');
    const copyR = root.querySelector('#hlCopyR');
    const goR = root.querySelector('#hlGoR');
    const endR = root.querySelector('#hlEndR');

    const createBtn = root.querySelector('#hlCreate');
    const info = root.querySelector('#hlInfo');
    const codeOut = root.querySelector('#hlCode');
    const copyBtn = root.querySelector('#hlCopy');
    const goBtn = root.querySelector('#hlGo');

    function showRunning(code){
      codeOutR.textContent = code || '—';
      runBox.classList.remove('hidden'); runBox.style.display='';
      const wrap = root.querySelector('#hlCreateWrap'); if (wrap) { wrap.classList.add('hidden'); wrap.style.display='none'; }
    }

    // Detect running game via state or DB
    let st = state();
    if (st && st.gameCode && st.status && st.status!=='ended'){
      showRunning(st.gameCode);
    } else {
      const row = await detectRunningForHost();
      if (row && row.code){
        showRunning(row.code);
        // Prepare host state for room
        try{ await global.autoJoinAsHost(row.code); }catch(_){}
      }
    }

    copyR.addEventListener('click', ()=>{ const t=(codeOutR.textContent||'').trim(); if(t && t!=='—') copy(t); });
    goR.addEventListener('click', goToLegacyHostRoom);
    endR.addEventListener('click', function(){
      if(!confirm('End the current game?')) return;
      try{
        const endBtn = document.getElementById('endAnalyzeBtn');
        if(endBtn && typeof endBtn.click==='function'){ endBtn.click(); }
      }catch(_){}
    });

    copyBtn.addEventListener('click', ()=>{ const t=(codeOut.textContent||'').trim(); if(t && t!=='—') copy(t); });
    goBtn.addEventListener('click', goToLegacyHostRoom);

    createBtn.addEventListener('click', async function(){
      // If running already, just go
      const cur = state();
      if (cur && cur.gameCode && cur.status && cur.status!=='ended'){ showRunning(cur.gameCode); return; }

      createBtn.disabled = true; createBtn.textContent='Creating...';
      // Reuse your existing handler to avoid diverging from backend logic
      const btn = document.getElementById('createGameBtn');
      if (btn && typeof btn.click==='function'){ btn.click(); }
      // Poll for code for up to 10s
      const t0 = Date.now();
      (function wait(){
        const s = state();
        if (s && s.gameCode){ codeOut.textContent = s.gameCode; info.classList.remove('hidden'); info.style.display=''; createBtn.disabled=false; createBtn.textContent='Create Game'; return; }
        if (Date.now()-t0>10000){ createBtn.disabled=false; createBtn.textContent='Create Game'; alert('Could not confirm the new game. If you already have an active game, use Go to Game Room.'); return; }
        setTimeout(wait, 300);
      })();
    });
  };
})(window);
