(function(){
  const $ = (id) => document.getElementById(id);

  // Create an on-screen log if the page lacks #hostLog
  function ensureLogArea(){
    let el = $('hostLog');
    if (el) return el;
    el = document.createElement('pre');
    el.id = 'hostLog';
    el.style.position = 'fixed';
    el.style.right = '12px';
    el.style.bottom = '12px';
    el.style.width = '360px';
    el.style.maxHeight = '40vh';
    el.style.overflow = 'auto';
    el.style.padding = '10px';
    el.style.borderRadius = '10px';
    el.style.background = 'rgba(15,23,42,0.9)';
    el.style.color = '#e2e8f0';
    el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    el.style.fontSize = '12px';
    el.style.zIndex = '2147483647';
    el.style.boxShadow = '0 8px 30px rgba(0,0,0,0.4)';
    el.textContent = 'MatchSqr log ready.\n';
    document.body.appendChild(el);
    return el;
  }
  const hostLog = ensureLogArea();

  const log = (msg) => {
    const text = (typeof msg === 'string') ? msg : JSON.stringify(msg, null, 2);
    hostLog.textContent += text + "\n";
    hostLog.scrollTop = hostLog.scrollHeight;
  };

  // Basic elements (may be missing in your HTML; that's okay)
  const els = {
    home: $('homeSection'), host: $('hostSection'), join: $('joinSection'),
    hostEmail: $('hostEmail'), hostPassword: $('hostPassword'),
    guestName: $('guestName'), joinCode: $('joinCode'),
    gameIdOut: $('gameIdOut'), gameCodeOut: $('gameCodeOut'),
    statusOut: $('statusOut'), endsAtOut: $('endsAtOut'), timeLeft: $('timeLeft')
  };

  const state = {
    supa: null, session: null,
    functionsBase: null, config: null,
    gameId: null, gameCode: null, status: null, endsAt: null,
    timer: { h: null }
  };

  // Helper: show/hide
  const show = (el)=> el && el.classList.remove('hidden');
  const hide = (el)=> el && el.classList.add('hidden');

  // Initialize Supabase from /config (accepts {url, anon} OR {supabase_url, supabase_anon_key}) with fallbacks
  function initFromFallbacks(){
    const fbUrl  = window.CONFIG?.FALLBACK_SUPABASE_URL || "";
    const fbAnon = window.CONFIG?.FALLBACK_SUPABASE_ANON_KEY || "";
    if (fbUrl && fbAnon && !state.supa){
      try {
        state.supa = window.supabase.createClient(fbUrl, fbAnon);
        log('Initialized from fallback Supabase credentials.');
      } catch (e) {
        log('Fallback init error: ' + e.message);
      }
    }
  }

  async function loadConfig(){
    const baseRaw = window.CONFIG?.FUNCTIONS_BASE || '';
    const base = baseRaw.replace(/\/$/, '');
    if (!base){ log('Please set FUNCTIONS_BASE in config.js'); return; }
    state.functionsBase = base;
    initFromFallbacks();
    try {
      const t0 = performance.now();
      const r = await fetch(base + '/config', { method:'GET' });
      const text = await r.text();
      const dt = Math.round(performance.now() - t0);
      log(`Config HTTP ${r.status} in ${dt}ms`);
      let cfg; try { cfg = JSON.parse(text); } catch { cfg = { ok:false, raw:text }; }
      state.config = cfg;
      console.log('CONFIG response:', cfg);
      const supabaseUrl = cfg.supabase_url || cfg.public_supabase_url || cfg.url || window.CONFIG.FALLBACK_SUPABASE_URL;
      const supabaseAnon = cfg.supabase_anon_key || cfg.public_supabase_anon_key || cfg.anon || window.CONFIG.FALLBACK_SUPABASE_ANON_KEY;
      if (!state.supa){
        if (!supabaseUrl || !supabaseAnon) throw new Error('Config missing supabase keys');
        state.supa = window.supabase.createClient(supabaseUrl, supabaseAnon);
        log('Supabase client initialized from /config.');
      }
    } catch (e) {
      if (!state.supa) log('Config load failed and no fallbacks: ' + e.message);
      else log('Config load failed, using fallbacks: ' + e.message);
    }
  }
  loadConfig();

  // Countdown
  function startCountdownFrom(iso){
    state.endsAt = iso ? new Date(iso) : null;
    if (state.timer.h) clearInterval(state.timer.h);
    if (!state.endsAt){ if (els.timeLeft) els.timeLeft.textContent = '—'; return; }
    function tick(){
      const ms = state.endsAt - Date.now();
      if (ms <= 0){
        if (els.timeLeft) els.timeLeft.textContent = '00:00:00';
        clearInterval(state.timer.h); state.timer.h = null;
        log('Time finished. You can end the game and analyze.');
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

  // ACTIONS
  async function doLogin(email, password){
    if (!state.supa){ log('Supabase client not ready. Check config.js and /config.'); return; }
    const t0 = performance.now();
    const { data, error } = await state.supa.auth.signInWithPassword({ email, password });
    const dt = Math.round(performance.now() - t0);
    if (error){ log(`Login failed (${dt}ms): ` + error.message); return; }
    state.session = data.session;
    log(`Login ok (${dt}ms)`);
    // Auto resume/create to reduce clicks
    await createOrResume();
  }

  async function createOrResume(){
    if (!state.session?.access_token){ log('Please login first'); return; }
    const url = state.functionsBase + '/create_game';
    log('Creating/resuming...');
    try {
      const t0 = performance.now();
      const r = await fetch(url, { method:'POST', headers:{ 'authorization':'Bearer ' + state.session.access_token } });
      const dt = Math.round(performance.now() - t0);
      const out = await r.json().catch(()=>({}));
      if (!r.ok){ log(`Create/resume failed (${dt}ms)`); log(out); return; }
      log(`Create/resume ok (${dt}ms)`);
      applyGameState(out);
      log(out);
    } catch (e) {
      log('Create/resume error: ' + e.message);
    }
  }

  async function startGame(){
    if (!state.session?.access_token){ log('Please login first'); return; }
    if (!state.gameId){ log('No game to start. Create or Resume first.'); return; }
    const url = state.functionsBase + '/start_game';
    log('Starting game...');
    try {
      const t0 = performance.now();
      const r = await fetch(url, {
        method:'POST',
        headers:{ 'authorization':'Bearer ' + state.session.access_token, 'content-type':'application/json' },
        body: JSON.stringify({ gameId: state.gameId, id: state.gameId, game_id: state.gameId })
      });
      const dt = Math.round(performance.now() - t0);
      const out = await r.json().catch(()=>({}));
      if (!r.ok){ log(`Start failed (${dt}ms)`); log(out); return; }
      log(`Start ok (${dt}ms)`);
      applyGameState(out.game || out);
      log(out);
    } catch (e) {
      log('Start error: ' + e.message);
    }
  }

  async function endGame(){
    if (!state.session?.access_token){ log('Please login first'); return; }
    if (!state.gameId){ log('No game id in memory. Click Create/Resume first.'); return; }
    const base = state.functionsBase + '/end_game_and_analyze';
    log('Ending game & analyzing...');
    try {
      const t0 = performance.now();
      let r = await fetch(base, {
        method:'POST',
        headers:{ 'authorization':'Bearer ' + state.session.access_token, 'content-type':'application/json' },
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
      if (!r.ok){ log(`End failed (${dt}ms)`); log(out); return; }
      log(`End ok (${dt}ms)`);
      log(out);
      if (state.timer.h){ clearInterval(state.timer.h); state.timer.h = null; }
      if (els.timeLeft) els.timeLeft.textContent = '—';
      if (els.statusOut) els.statusOut.textContent = 'ended';
    } catch (e) {
      log('End error: ' + e.message);
    }
  }

  async function joinGuest(name, code){
    const url = state.functionsBase + '/join_game_guest';
    const t0 = performance.now();
    try {
      const r = await fetch(url, { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ name, code }) });
      const dt = Math.round(performance.now() - t0);
      const out = await r.json().catch(()=>({}));
      if (!r.ok){ log(`Join failed (${dt}ms)`); log(out); return; }
      log(`Join ok (${dt}ms)`);
      log(out);
    } catch (e) {
      log('Join error: ' + e.message);
    }
  }

  // Wire by ID if present
  const loginForm = $('hostLoginForm');
  if (loginForm){
    loginForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      await doLogin(($('hostEmail')?.value||'').trim(), $('hostPassword')?.value||'');
    });
  }

  const createBtn = $('createOrResumeBtn') || $('createRoomBtn') || $('createGameBtn');
  if (createBtn) createBtn.addEventListener('click', createOrResume);

  const startBtn = $('startGameBtn') || $('startGameLocalBtn');
  if (startBtn) startBtn.addEventListener('click', startGame);

  const endBtn = $('endAnalyzeBtn');
  if (endBtn) endBtn.addEventListener('click', endGame);

  // Also wire by button text if IDs differ (fallback)
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('button');
    if (!el) return;
    const txt = (el.textContent || '').toLowerCase();
    if (txt.includes('create') || txt.includes('resume')) return createOrResume();
    if (txt.includes('start')) return startGame();
    if (txt.includes('end') && (txt.includes('analyze') || txt.includes('game'))) return endGame();
  });

  // Expose debug API
  window.ms = { state, createOrResume, startGame, endGame };

})();
