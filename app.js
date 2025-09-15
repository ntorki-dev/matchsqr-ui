(function(){
  const log = (el, msg) => {
    if (!el) return;
    const text = (typeof msg === 'string') ? msg : JSON.stringify(msg, null, 2);
    el.textContent = text;
  };
  const append = (el, msg) => {
    if (!el) return;
    const text = (typeof msg === 'string') ? msg : JSON.stringify(msg, null, 2);
    el.textContent = (el.textContent ? el.textContent + "\n" : "") + text;
  };
  const $ = (id) => document.getElementById(id);

  // Grab elements (support old & new ids)
  const els = {
    // nav
    btnHome: $('btnHome'), btnLogin: $('btnLogin'),
    // sections
    home: $('homeSection'), host: $('hostSection'), join: $('joinSection'),
    // tabs
    hostBtn: $('hostBtn'), joinBtn: $('joinBtn'),
    // host auth
    hostLoginForm: $('hostLoginForm'),
    hostEmail: $('hostEmail'), hostPassword: $('hostPassword'),
    // actions (support both names)
    createOrResumeBtn: $('createOrResumeBtn') || $('createRoomBtn'),
    startGameBtn: $('startGameBtn') || $('startGameLocalBtn'),
    endAnalyzeBtn: $('endAnalyzeBtn'),
    // outputs
    hostLog: $('hostLog'),
    gameIdOut: $('gameIdOut'), gameCodeOut: $('gameCodeOut'),
    statusOut: $('statusOut'), endsAtOut: $('endsAtOut'),
    timeLeft: $('timeLeft'),
    // join
    guestName: $('guestName'), joinCode: $('joinCode'),
    joinRoomBtn: $('joinRoomBtn'), joinLog: $('joinLog')
  };

  // App state
  const state = {
    supa: null, session: null,
    functionsBase: null,
    config: null,
    gameId: null, gameCode: null, status: null, endsAt: null,
    timer: { h: null }
  };

  // UI helpers
  const show = (el)=> el && el.classList.remove('hidden');
  const hide = (el)=> el && el.classList.add('hidden');

  if (els.btnHome) els.btnHome.onclick = () => { show(els.home); hide(els.host); hide(els.join); };
  if (els.hostBtn) els.hostBtn.onclick = () => { hide(els.home); show(els.host); hide(els.join); };
  if (els.joinBtn) els.joinBtn.onclick = () => { hide(els.home); hide(els.host); show(els.join); };

  // Init from config function (accepts {url, anon} OR {supabase_url, supabase_anon_key})
  function initFromFallbacks(){
    const fbUrl  = window.CONFIG?.FALLBACK_SUPABASE_URL || "";
    const fbAnon = window.CONFIG?.FALLBACK_SUPABASE_ANON_KEY || "";
    if (fbUrl && fbAnon && !state.supa){
      try {
        state.supa = window.supabase.createClient(fbUrl, fbAnon);
        append(els.hostLog, 'Initialized from fallback Supabase credentials.');
      } catch (e) {
        append(els.hostLog, 'Fallback init error: ' + e.message);
      }
    }
  }

  async function loadConfig(){
    const baseRaw = window.CONFIG?.FUNCTIONS_BASE || '';
    const base = baseRaw.replace(/\/$/, '');
    state.functionsBase = base;
    if (!base) { log(els.hostLog, 'Please set FUNCTIONS_BASE in config.js'); return; }

    initFromFallbacks();

    try {
      const t0 = performance.now();
      const r = await fetch(base + '/config', { method:'GET' });
      const text = await r.text();
      const dt = Math.round(performance.now() - t0);
      append(els.hostLog, `Config HTTP ${r.status} in ${dt}ms`);
      let cfg; try { cfg = JSON.parse(text); } catch { cfg = { ok:false, raw:text }; }
      state.config = cfg;
      console.log('CONFIG response:', cfg);

      const supabaseUrl = cfg.supabase_url || cfg.public_supabase_url || cfg.url || window.CONFIG.FALLBACK_SUPABASE_URL;
      const supabaseAnon = cfg.supabase_anon_key || cfg.public_supabase_anon_key || cfg.anon || window.CONFIG.FALLBACK_SUPABASE_ANON_KEY;
      if (!state.supa){
        if (!supabaseUrl || !supabaseAnon) throw new Error('Config missing supabase keys');
        state.supa = window.supabase.createClient(supabaseUrl, supabaseAnon);
        append(els.hostLog, 'Supabase client initialized from /config.');
      }
    } catch (e) {
      if (!state.supa) append(els.hostLog, 'Config load failed and no fallbacks: ' + e.message);
      else append(els.hostLog, 'Config load failed, using fallbacks: ' + e.message);
    }
  }
  loadConfig();

  // Auth
  if (els.hostLoginForm) els.hostLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.supa) { log(els.hostLog, 'Supabase client not ready. Check config.js and /config.'); return; }
    const email = (els.hostEmail.value||'').trim();
    const password = els.hostPassword.value||'';
    const t0 = performance.now();
    const { data, error } = await state.supa.auth.signInWithPassword({ email, password });
    const dt = Math.round(performance.now() - t0);
    if (error) { log(els.hostLog, `Login failed (${dt}ms): ` + error.message); return; }
    state.session = data.session;
    append(els.hostLog, `Login ok (${dt}ms)`);
  });

  function startCountdownFrom(iso){
    state.endsAt = iso ? new Date(iso) : null;
    if (state.timer.h) clearInterval(state.timer.h);
    if (!state.endsAt){ if (els.timeLeft) els.timeLeft.textContent = '—'; return; }
    function tick(){
      const ms = state.endsAt - Date.now();
      if (ms <= 0){
        if (els.timeLeft) els.timeLeft.textContent = '00:00:00';
        clearInterval(state.timer.h); state.timer.h = null;
        append(els.hostLog, 'Time finished. You can end the game and analyze.');
        return;
      }
      const s = Math.floor(ms/1000);
      const hh = String(Math.floor(s/3600)).padStart(2,'0');
      const mm = String(Math.floor((s%3600)/60)).padStart(2,'0');
      const ss = String(s%60).padStart(2,'0');
      if (els.timeLeft) els.timeLeft.textContent = `${hh}:${mm}:${ss}`;
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

  // Create OR Resume (works even if you still have the old "Create Game" button id)
  async function createOrResume(){
    if (!state.session?.access_token) { log(els.hostLog, 'Please login first'); return; }
    const url = state.functionsBase + '/create_game';
    append(els.hostLog, 'Creating/resuming...');
    try {
      const t0 = performance.now();
      const r = await fetch(url, { method:'POST', headers:{ 'authorization':'Bearer ' + state.session.access_token } });
      const dt = Math.round(performance.now() - t0);
      const out = await r.json().catch(()=>({}));
      if (!r.ok) { append(els.hostLog, `Create/resume failed (${dt}ms)`); log(els.hostLog, out); return; }
      append(els.hostLog, `Create/resume ok (${dt}ms)`);
      applyGameState(out);
      log(els.hostLog, out);
    } catch (e) {
      append(els.hostLog, 'Create/resume error: ' + e.message);
    }
  }

  if (els.createOrResumeBtn) els.createOrResumeBtn.addEventListener('click', createOrResume);

  // Start (server-bound). If page still has the old "Start Game (local timer)" button, we repurpose it to call server /start_game.
  async function startGameServer(){
    if (!state.session?.access_token) { log(els.hostLog, 'Please login first'); return; }
    if (!state.gameId) { log(els.hostLog, 'No game to start. Click Create or Resume first.'); return; }
    const url = state.functionsBase + '/start_game';
    append(els.hostLog, 'Starting game...');
    try {
      const t0 = performance.now();
      const r = await fetch(url, {
        method:'POST',
        headers:{ 'authorization': 'Bearer ' + state.session.access_token, 'content-type':'application/json' },
        body: JSON.stringify({ gameId: state.gameId, id: state.gameId, game_id: state.gameId })
      });
      const dt = Math.round(performance.now() - t0);
      const out = await r.json().catch(()=>({}));
      if (!r.ok) { append(els.hostLog, `Start failed (${dt}ms)`); log(els.hostLog, out); return; }
      append(els.hostLog, `Start ok (${dt}ms)`);
      applyGameState(out.game || out);
      log(els.hostLog, out);
    } catch (e) {
      append(els.hostLog, 'Start error: ' + e.message);
    }
  }

  if (els.startGameBtn) els.startGameBtn.addEventListener('click', startGameServer);

  // End & analyze (send body then fallback with query string if backend wants it that way)
  async function endGame(){
    if (!state.session?.access_token) { log(els.hostLog, 'Please login first'); return; }
    if (!state.gameId) { log(els.hostLog, 'No game created'); return; }
    const base = state.functionsBase + '/end_game_and_analyze';
    append(els.hostLog, 'Ending game & analyzing...');
    try {
      const t0 = performance.now();
      let r = await fetch(base, {
        method:'POST',
        headers:{ 'authorization': 'Bearer ' + state.session.access_token, 'content-type':'application/json' },
        body: JSON.stringify({ gameId: state.gameId, id: state.gameId, game_id: state.gameId, code: state.gameCode })
      });
      let dt = Math.round(performance.now() - t0);
      let out = await r.json().catch(()=>({}));
      if (!r.ok && (out?.error||'').toLowerCase().includes('missing_game_id')){
        const qs = new URLSearchParams({ gameId:String(state.gameId), id:String(state.gameId), game_id:String(state.gameId), code:String(state.gameCode||'') });
        const t1 = performance.now();
        r = await fetch(base + '?' + qs.toString(), { method:'POST', headers:{ 'authorization': 'Bearer ' + state.session.access_token } });
        dt = Math.round(performance.now() - t1);
        out = await r.json().catch(()=>({}));
      }
      if (!r.ok){ append(els.hostLog, `End failed (${dt}ms)`); log(els.hostLog, out); return; }
      append(els.hostLog, `End ok (${dt}ms)`);
      log(els.hostLog, out);
      if (state.timer.h) { clearInterval(state.timer.h); state.timer.h = null; }
      if (els.timeLeft) els.timeLeft.textContent = '—';
      if (els.statusOut) els.statusOut.textContent = 'ended';
    } catch (e) {
      append(els.hostLog, 'End error: ' + e.message);
    }
  }

  if (els.endAnalyzeBtn) els.endAnalyzeBtn.addEventListener('click', endGame);

  // Join as guest
  if (els.joinRoomBtn) els.joinRoomBtn.addEventListener('click', async () => {
    const name = (els.guestName.value||'').trim();
    const code = (els.joinCode.value||'').trim();
    if (!name || !code){ log(els.joinLog, 'Enter name and Game ID'); return; }
    const url = (state.functionsBase||'') + '/join_game_guest';
    try {
      const t0 = performance.now();
      const r = await fetch(url, { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ name, code }) });
      const dt = Math.round(performance.now() - t0);
      const out = await r.json().catch(()=>({}));
      if (!r.ok){ append(els.joinLog, `Join failed (${dt}ms)`); log(els.joinLog, out); return; }
      append(els.joinLog, `Join ok (${dt}ms)`);
      log(els.joinLog, out);
    } catch (e) {
      append(els.joinLog, 'Join error: ' + e.message);
    }
  });

})();
