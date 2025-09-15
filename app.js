(function(){
  const log = (el, obj) => {
    if (typeof obj === 'string') el.textContent = obj;
    else el.textContent = JSON.stringify(obj, null, 2);
  };

  const els = {
    btnHome: document.getElementById('btnHome'),
    btnLogin: document.getElementById('btnLogin'),
    hostBtn: document.getElementById('hostBtn'),
    joinBtn: document.getElementById('joinBtn'),
    home: document.getElementById('homeSection'),
    host: document.getElementById('hostSection'),
    join: document.getElementById('joinSection'),
    hostLoginForm: document.getElementById('hostLoginForm'),
    hostEmail: document.getElementById('hostEmail'),
    hostPassword: document.getElementById('hostPassword'),
    createRoomBtn: document.getElementById('createRoomBtn'),
    startGameLocalBtn: document.getElementById('startGameLocalBtn'),
    endAnalyzeBtn: document.getElementById('endAnalyzeBtn'),
    hostLog: document.getElementById('hostLog'),
    guestName: document.getElementById('guestName'),
    joinCode: document.getElementById('joinCode'),
    joinRoomBtn: document.getElementById('joinRoomBtn'),
    joinLog: document.getElementById('joinLog'),
    timeLeft: document.getElementById('timeLeft'),
    gameCodeOut: document.getElementById('gameCodeOut'),
    gameIdOut: document.getElementById('gameIdOut'),
  };

  const state = {
    config: null,
    supa: null,
    session: null,
    gameId: null,
    gameCode: null,
    timer: { end: null, h: null }
  };

  function show(el){ el.classList.remove('hidden'); }
  function hide(el){ el.classList.add('hidden'); }

  els.btnHome.onclick = () => { show(els.home); hide(els.host); hide(els.join); };
  els.hostBtn.onclick  = () => { hide(els.home); show(els.host); hide(els.join); };
  els.joinBtn.onclick  = () => { hide(els.home); hide(els.host); show(els.join); };

  // Fetch runtime config from your backend 'config' function
  async function loadConfig(){
    const base = window.CONFIG.FUNCTIONS_BASE.replace(/\/$/, '');
    state.functionsBase = base;
    try {
      const r = await fetch(base + '/config', { method: 'GET' });
      if (r.ok) {
        const cfg = await r.json();
        state.config = cfg;
        const supabaseUrl = cfg.supabase_url || cfg.public_supabase_url || window.CONFIG.FALLBACK_SUPABASE_URL;
        const supabaseAnon = cfg.supabase_anon_key || cfg.public_supabase_anon_key || window.CONFIG.FALLBACK_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseAnon) throw new Error('Missing supabase_url or supabase_anon_key');
        state.supa = window.supabase.createClient(supabaseUrl, supabaseAnon);
        log(els.hostLog, 'Config loaded');
      } else {
        throw new Error('Config HTTP ' + r.status);
      }
    } catch (e) {
      log(els.hostLog, 'Config error: ' + e.message + '. Edit config.js and set FALLBACK_SUPABASE_* and FUNCTIONS_BASE.');
    }
  }
  loadConfig();

  // Host login
  els.hostLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.supa) { log(els.hostLog, 'Supabase client not ready'); return; }
    const email = els.hostEmail.value.trim();
    const password = els.hostPassword.value;
    const { data, error } = await state.supa.auth.signInWithPassword({ email, password });
    if (error) { log(els.hostLog, 'Login failed: ' + error.message); return; }
    state.session = data.session;
    log(els.hostLog, 'Login ok');
  });

  // Create game
  els.createRoomBtn.addEventListener('click', async () => {
    if (!state.session?.access_token) { log(els.hostLog, 'Please login first'); return; }
    try {
      const r = await fetch(state.functionsBase + '/create_game', {
        method: 'POST',
        headers: { 'authorization': 'Bearer ' + state.session.access_token }
      });
      const out = await r.json();
      if (!r.ok) { log(els.hostLog, out); return; }
      state.gameId = out.game_id || out.id || null;
      state.gameCode = out.code || null;
      els.gameIdOut.textContent = state.gameId || '—';
      els.gameCodeOut.textContent = state.gameCode || '—';
      log(els.hostLog, out);
    } catch (e) {
      log(els.hostLog, 'Create error: ' + e.message);
    }
  });

  // Local timer start, starts only on client for now
  function updateTimer(){
    if (!state.timer.end){ els.timeLeft.textContent = '—'; return; }
    const ms = state.timer.end - Date.now();
    if (ms <= 0){
      els.timeLeft.textContent = '00:00:00';
      clearInterval(state.timer.h);
      state.timer.h = null;
      // show prompt or just log
      log(els.hostLog, 'Time finished. You can end the game and analyze.');
      return;
    }
    const s = Math.floor(ms/1000);
    const hh = String(Math.floor(s/3600)).padStart(2,'0');
    const mm = String(Math.floor((s%3600)/60)).padStart(2,'0');
    const ss = String(s%60).padStart(2,'0');
    els.timeLeft.textContent = hh + ':' + mm + ':' + ss;
  }

  els.startGameLocalBtn.addEventListener('click', () => {
    const minutes = Number(state?.config?.session_minutes ?? 60);
    state.timer.end = Date.now() + minutes*60*1000;
    if (state.timer.h) clearInterval(state.timer.h);
    state.timer.h = setInterval(updateTimer, 1000);
    updateTimer();
    log(els.hostLog, 'Timer started for ' + minutes + ' minutes.');
  });

  // End game & analyze
  els.endAnalyzeBtn.addEventListener('click', async () => {
    if (!state.session?.access_token) { log(els.hostLog, 'Please login first'); return; }
    if (!state.gameId) { log(els.hostLog, 'No game created'); return; }
    try {
      const r = await fetch(state.functionsBase + '/end_game_and_analyze', {
        method: 'POST',
        headers: { 'authorization': 'Bearer ' + state.session.access_token, 'content-type': 'application/json' },
        body: JSON.stringify({ gameId: state.gameId })
      });
      const out = await r.json();
      log(els.hostLog, out);
    } catch (e) {
      log(els.hostLog, 'End error: ' + e.message);
    }
  });

  // Join as guest
  els.joinRoomBtn.addEventListener('click', async () => {
    const name = els.guestName.value.trim();
    const code = els.joinCode.value.trim();
    if (!name || !code){ log(els.joinLog, 'Enter name and Game ID'); return; }
    try {
      const r = await fetch(state.functionsBase + '/join_game_guest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, code })
      });
      const out = await r.json();
      if (!r.ok) { log(els.joinLog, out); return; }
      log(els.joinLog, out);
    } catch (e) {
      log(els.joinLog, 'Join error: ' + e.message);
    }
  });

})();