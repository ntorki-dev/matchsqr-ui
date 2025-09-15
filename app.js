(function(){
  const log = (el, obj) => {
    if (!el) return;
    if (typeof obj === 'string') el.textContent = obj;
    else el.textContent = JSON.stringify(obj, null, 2);
  };

  const $ = (id) => document.getElementById(id);

  const els = {
    btnHome: $('btnHome'),
    btnLogin: $('btnLogin'),
    hostBtn: $('hostBtn'),
    joinBtn: $('joinBtn'),
    home: $('homeSection'),
    host: $('hostSection'),
    join: $('joinSection'),

    hostLoginForm: $('hostLoginForm'),
    hostEmail: $('hostEmail'),
    hostPassword: $('hostPassword'),

    createOrResumeBtn: $('createOrResumeBtn'),
    startGameBtn: $('startGameBtn'),
    endAnalyzeBtn: $('endAnalyzeBtn'),

    hostLog: $('hostLog'),

    guestName: $('guestName'),
    joinCode: $('joinCode'),
    joinRoomBtn: $('joinRoomBtn'),
    joinLog: $('joinLog'),

    timeLeft: $('timeLeft'),
    gameCodeOut: $('gameCodeOut'),
    gameIdOut: $('gameIdOut'),
    statusOut: $('statusOut'),
    endsAtOut: $('endsAtOut'),
  };

  const state = {
    config: null,
    supa: null,
    session: null,
    gameId: null,
    gameCode: null,
    status: null,
    endsAt: null,
    timer: { h: null },
    functionsBase: null
  };

  function show(el){ el && el.classList.remove('hidden'); }
  function hide(el){ el && el.classList.add('hidden'); }

  if (els.btnHome)  els.btnHome.onclick = () => { show(els.home); hide(els.host); hide(els.join); };
  if (els.hostBtn)  els.hostBtn.onclick  = () => { hide(els.home); show(els.host); hide(els.join); };
  if (els.joinBtn)  els.joinBtn.onclick  = () => { hide(els.home); hide(els.host); show(els.join); };

  function initFromFallbacks(){
    const fbUrl  = window.CONFIG?.FALLBACK_SUPABASE_URL || "";
    const fbAnon = window.CONFIG?.FALLBACK_SUPABASE_ANON_KEY || "";
    if (fbUrl && fbAnon && !state.supa){
      try {
        state.supa = window.supabase.createClient(fbUrl, fbAnon);
        log(els.hostLog, 'Initialized from fallback Supabase credentials.');
      } catch (e) {
        log(els.hostLog, 'Fallback init error: ' + e.message);
      }
    }
  }

  async function loadConfig(){
    const baseRaw = window.CONFIG?.FUNCTIONS_BASE || '';
    const base = baseRaw.replace(/\/$/, '');
    if (!base){ log(els.hostLog, 'Please set FUNCTIONS_BASE in config.js'); return; }
    state.functionsBase = base;

    initFromFallbacks();

    try {
      const r = await fetch(base + '/config', { method: 'GET' });
      const text = await r.text();
      let cfg = null;
      try { cfg = JSON.parse(text); } catch { cfg = { ok:false, raw:text }; }
      state.config = cfg;
      console.log('CONFIG response:', cfg);

      const supabaseUrl = cfg.supabase_url || cfg.public_supabase_url || cfg.url || window.CONFIG.FALLBACK_SUPABASE_URL;
      const supabaseAnon = cfg.supabase_anon_key || cfg.public_supabase_anon_key || cfg.anon || window.CONFIG.FALLBACK_SUPABASE_ANON_KEY;

      if (!state.supa){
        if (!supabaseUrl || !supabaseAnon) throw new Error('Config missing supabase keys');
        state.supa = window.supabase.createClient(supabaseUrl, supabaseAnon);
        log(els.hostLog, 'Config loaded and Supabase client initialized.');
      } else {
        log(els.hostLog, 'Config loaded. Using previously initialized Supabase client.');
      }
    } catch (e) {
      if (state.supa){
        log(els.hostLog, 'Config fetch failed but fallbacks are active: ' + e.message);
      } else {
        log(els.hostLog, 'Config error: ' + e.message + '. Edit config.js and set FALLBACK_SUPABASE_* and FUNCTIONS_BASE.');
      }
    }
  }
  loadConfig();

  // Host login
  if (els.hostLoginForm) els.hostLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.supa) { log(els.hostLog, 'Supabase client not ready. Check config.js and /config.'); return; }
    const email = (els.hostEmail.value || '').trim();
    const password = els.hostPassword.value || '';
    const { data, error } = await state.supa.auth.signInWithPassword({ email, password });
    if (error) { log(els.hostLog, 'Login failed: ' + error.message); return; }
    state.session = data.session;
    log(els.hostLog, 'Login ok');
  });

  function startCountdownFrom(iso){
    state.endsAt = iso ? new Date(iso) : null;
    if (state.timer.h) clearInterval(state.timer.h);
    if (!state.endsAt){ if (els.timeLeft) els.timeLeft.textContent = '—'; return; }
    function tick(){
      const ms = state.endsAt - Date.now();
      if (ms <= 0){
        if (els.timeLeft) els.timeLeft.textContent = '00:00:00';
        clearInterval(state.timer.h);
        state.timer.h = null;
        log(els.hostLog, 'Time finished. You can end the game and analyze.');
        return;
      }
      const s = Math.floor(ms/1000);
      const hh = String(Math.floor(s/3600)).padStart(2,'0');
      const mm = String(Math.floor((s%3600)/60)).padStart(2,'0');
      const ss = String(s%60).padStart(2,'0');
      if (els.timeLeft) els.timeLeft.textContent = hh + ':' + mm + ':' + ss;
    }
    state.timer.h = setInterval(tick, 1000);
    tick();
  }

  function applyGameState(g){
    if (!g) return;
    state.gameId = g.id || g.game_id || state.gameId;
    state.gameCode = g.code || state.gameCode;
    state.status = g.status || state.status;
    if (els.gameIdOut)  els.gameIdOut.textContent  = state.gameId || '—';
    if (els.gameCodeOut)els.gameCodeOut.textContent= state.gameCode || '—';
    if (els.statusOut)  els.statusOut.textContent  = state.status || '—';
    if (els.endsAtOut)  els.endsAtOut.textContent  = g.ends_at || '—';
    if (g.ends_at) startCountdownFrom(g.ends_at);
  }

  // Create or Resume game
  if (els.createOrResumeBtn) els.createOrResumeBtn.addEventListener('click', async () => {
    if (!state.session?.access_token) { log(els.hostLog, 'Please login first'); return; }
    try {
      const r = await fetch(state.functionsBase + '/create_game', {
        method: 'POST',
        headers: { 'authorization': 'Bearer ' + state.session.access_token }
      });
      const out = await r.json();
      if (!r.ok) { log(els.hostLog, out); return; }
      applyGameState(out);
      log(els.hostLog, out);
    } catch (e) {
      log(els.hostLog, 'Create/resume error: ' + e.message);
    }
  });

  // Start game on server, sets status=running and ends_at
  if (els.startGameBtn) els.startGameBtn.addEventListener('click', async () => {
    if (!state.session?.access_token) { log(els.hostLog, 'Please login first'); return; }
    if (!state.gameId) { log(els.hostLog, 'No game to start. Click Create or Resume first.'); return; }
    try {
      const r = await fetch(state.functionsBase + '/start_game', {
        method: 'POST',
        headers: { 'authorization': 'Bearer ' + state.session.access_token, 'content-type': 'application/json' },
        body: JSON.stringify({ gameId: state.gameId, id: state.gameId, game_id: state.gameId })
      });
      const out = await r.json();
      if (!r.ok) { log(els.hostLog, out); return; }
      applyGameState(out.game || out);
      log(els.hostLog, out);
    } catch (e) {
      log(els.hostLog, 'Start error: ' + e.message);
    }
  });

  async function endGameServerFirstTry(){
    return fetch(state.functionsBase + '/end_game_and_analyze', {
      method: 'POST',
      headers: { 'authorization': 'Bearer ' + state.session.access_token, 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: state.gameId, id: state.gameId, game_id: state.gameId, code: state.gameCode })
    });
  }

  async function endGameServerFallbackQuery(){
    const qp = new URLSearchParams({ gameId: String(state.gameId || ''), id: String(state.gameId || ''), game_id: String(state.gameId || ''), code: String(state.gameCode || '') });
    return fetch(state.functionsBase + '/end_game_and_analyze?' + qp.toString(), {
      method: 'POST',
      headers: { 'authorization': 'Bearer ' + state.session.access_token }
    });
  }

  // End game & analyze
  if (els.endAnalyzeBtn) els.endAnalyzeBtn.addEventListener('click', async () => {
    if (!state.session?.access_token) { log(els.hostLog, 'Please login first'); return; }
    if (!state.gameId) { log(els.hostLog, 'No game created'); return; }
    try {
      let r = await endGameServerFirstTry();
      let out = await r.json().catch(() => ({}));
      if (!r.ok && (out?.error || '').toLowerCase().includes('missing_game_id')) {
        r = await endGameServerFallbackQuery();
        out = await r.json().catch(() => ({}));
      }
      log(els.hostLog, out);
      if (r.ok) {
        if (state.timer.h) { clearInterval(state.timer.h); state.timer.h = null; }
        if (els.timeLeft) els.timeLeft.textContent = '—';
        if (els.statusOut) els.statusOut.textContent = 'ended';
      }
    } catch (e) {
      log(els.hostLog, 'End error: ' + e.message);
    }
  });

  // Join as guest
  if (els.joinRoomBtn) els.joinRoomBtn.addEventListener('click', async () => {
    const name = (els.guestName.value || '').trim();
    const code = (els.joinCode.value || '').trim();
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
