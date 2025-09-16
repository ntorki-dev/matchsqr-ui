(function(){
  const $ = (id) => document.getElementById(id);
  const logEl = $('hostLog');
  const log = (msg) => {
    if (!logEl) return;
    const t = (typeof msg === 'string') ? msg : JSON.stringify(msg, null, 2);
    logEl.textContent = (logEl.textContent ? logEl.textContent + "\n" : "") + t;
    logEl.scrollTop = logEl.scrollHeight;
  };
  const setText = (el, v) => { if (el) el.textContent = v; };

  // Elements
  const els = {
    // sections
    home: $('homeSection'), host: $('hostSection'), join: $('joinSection'),
    // nav buttons
    btnHome: $('btnHome'), hostBtn: $('hostBtn'), joinBtn: $('joinBtn'),
    // host auth / controls
    hostLoginForm: $('hostLoginForm'), hostEmail: $('hostEmail'), hostPassword: $('hostPassword'),
    createGameBtn: $('createGameBtn') || $('createOrResumeBtn'), // keep compatibility if not renamed yet
    startGameBtn: $('startGameBtn'), endAnalyzeBtn: $('endAnalyzeBtn'),
    // host status UI
    gameIdOut: $('gameIdOut'), gameCodeOut: $('gameCodeOut'),
    statusOut: $('statusOut'), endsAtOut: $('endsAtOut'), timeLeft: $('timeLeft'),
    // host current card
    nextCardBtn: $('nextCardBtn'), questionText: $('questionText'), questionClar: $('questionClar'),
    // guest join + UI
    guestName: $('guestName'), joinCode: $('joinCode'), joinRoomBtn: $('joinRoomBtn'), joinLog: $('joinLog'),
    gQuestionText: $('gQuestionText'), gQuestionClar: $('gQuestionClar'), gTimeLeft: $('gTimeLeft')
  };

  // App state
  const state = {
    supa: null, session: null,
    functionsBase: null,
    gameId: null, gameCode: null, status: null, endsAt: null,
    hostCountdownHandle: null,
    heartbeatHandle: null,
    guestCode: null,
    guestPollHandle: null,         // <-- NEW: polling loop for guests
    guestCountdownHandle: null     // <-- NEW: countdown for guests
  };

  // Show/hide helpers
  const show = (el)=> el && el.classList.remove('hidden');
  const hide = (el)=> el && el.classList.add('hidden');
  if (els.btnHome) els.btnHome.onclick = () => { show(els.home); hide(els.host); hide(els.join); };
  if (els.hostBtn) els.hostBtn.onclick = () => { hide(els.home); show(els.host); hide(els.join); };
  if (els.joinBtn) els.joinBtn.onclick = () => { hide(els.home); hide(els.host); show(els.join); };

  // -------- Config / Supabase init --------
  async function loadConfig(){
    const baseRaw = (window.CONFIG && window.CONFIG.FUNCTIONS_BASE) || '';
    const base = baseRaw.replace(/\/$/, '');
    if (!base) { log('Please set FUNCTIONS_BASE in config.js'); return; }
    state.functionsBase = base;

    try {
      const t0 = performance.now();
      const r = await fetch(base + '/config');
      const text = await r.text();
      const dt = Math.round(performance.now() - t0);
      log(`Config HTTP ${r.status} in ${dt}ms`);
      let cfg; try { cfg = JSON.parse(text); } catch { cfg = {}; }
      const url  = cfg.supabase_url || cfg.public_supabase_url || cfg.url  || (window.CONFIG && window.CONFIG.FALLBACK_SUPABASE_URL);
      const anon = cfg.supabase_anon_key || cfg.public_supabase_anon_key || cfg.anon || (window.CONFIG && window.CONFIG.FALLBACK_SUPABASE_ANON_KEY);
      if (!url || !anon) throw new Error('Missing supabase url/anon');
      state.supa = window.supabase.createClient(url, anon);
      log('Supabase client initialized.');
    } catch (e) {
      log('Config load error: ' + e.message);
    }
  }
  loadConfig();

  // -------- Countdown helpers (host & guest) --------
  function clearHostCountdown(){
    if (state.hostCountdownHandle){ clearInterval(state.hostCountdownHandle); state.hostCountdownHandle = null; }
    setText(els.timeLeft, '—'); state.endsAt = null;
  }
  function clearGuestCountdown(){
    if (state.guestCountdownHandle){ clearInterval(state.guestCountdownHandle); state.guestCountdownHandle = null; }
    if (els.gTimeLeft) els.gTimeLeft.textContent = '—';
  }

  function startCountdown(which, iso){
    const ends = iso ? new Date(iso) : null;
    if (which === 'host'){
      clearHostCountdown();
      state.endsAt = ends;
    } else {
      clearGuestCountdown();
    }
    if (!ends){
      if (which === 'host') setText(els.timeLeft, '—');
      if (which === 'guest' && els.gTimeLeft) els.gTimeLeft.textContent = '—';
      return;
    }

    function tick(){
      const ms = ends - Date.now();
      const out = (ms <= 0)
        ? '00:00:00'
        : (() => {
            const s = Math.floor(ms/1000);
            const hh = String(Math.floor(s/3600)).padStart(2,'0');
            const mm = String(Math.floor((s%3600)/60)).padStart(2,'0');
            const ss = String(s%60).padStart(2,'0');
            return `${hh}:${mm}:${ss}`;
          })();
      if (which === 'host') setText(els.timeLeft, out);
      if (which === 'guest' && els.gTimeLeft) els.gTimeLeft.textContent = out;

      if (ms <= 0){
        if (which === 'host') clearHostCountdown();
        else clearGuestCountdown();
      }
    }

    const handle = setInterval(tick, 1000);
    tick();
    if (which === 'host') state.hostCountdownHandle = handle;
    else state.guestCountdownHandle = handle;
  }

  const hostTimerActive = () => state.status === 'running' && state.endsAt && state.endsAt.getTime() > Date.now();

  // -------- Heartbeat for host --------
  async function heartbeat(){
    if (!state.session?.access_token || !state.gameId) return;
    fetch(state.functionsBase + '/heartbeat', {
      method: 'POST',
      headers: { 'authorization': 'Bearer ' + state.session.access_token, 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: state.gameId })
    }).catch(()=>{});
  }
  function startHeartbeat(){
    if (state.heartbeatHandle) clearInterval(state.heartbeatHandle);
    state.heartbeatHandle = setInterval(heartbeat, 20000); // 20s
    heartbeat();
  }
  function stopHeartbeat(){
    if (state.heartbeatHandle){ clearInterval(state.heartbeatHandle); state.heartbeatHandle = null; }
  }

  // -------- Apply game row to host UI --------
  function applyGame(g){
    if (!g) return;
    state.gameId   = g.id || g.game_id || state.gameId;
    state.gameCode = g.code || state.gameCode;
    state.status   = g.status || state.status;

    const endsIso = (g.status === 'running') ? (g.ends_at || g.endsAt || null) : null;

    setText(els.gameIdOut,   state.gameId || '—');
    setText(els.gameCodeOut, state.gameCode || '—');
    setText(els.statusOut,   state.status || '—');
    setText(els.endsAtOut,   endsIso || '—');

    if (endsIso) startCountdown('host', endsIso);
    else clearHostCountdown();

    if (els.startGameBtn) els.startGameBtn.disabled = hostTimerActive();
    if (els.nextCardBtn)  els.nextCardBtn.disabled  = (state.status !== 'running');
  }

  // -------- Auth (host) --------
  if (els.hostLoginForm) els.hostLoginForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (!state.supa) { log('Supabase client not ready yet.'); return; }
    const email = (els.hostEmail.value || '').trim();
    const password = els.hostPassword.value || '';
    const t0 = performance.now();
    const { data, error } = await state.supa.auth.signInWithPassword({ email, password });
    const dt = Math.round(performance.now() - t0);
    if (error) { log(`Login failed (${dt}ms): ` + error.message); return; }
    state.session = data.session;
    log(`Login ok (${dt}ms)`);
  });

  // -------- Create Game (no resume) --------
  async function createGame(){
    if (!state.session?.access_token) { log('Please login first'); return; }
    const url = state.functionsBase + '/create_game';
    try {
      const t0 = performance.now();
      const r = await fetch(url, { method:'POST', headers:{ 'authorization':'Bearer ' + state.session.access_token } });
      const dt = Math.round(performance.now() - t0);
      const out = await r.json().catch(()=>({}));
      if (!r.ok) {
        if (out?.error === 'host_has_active_game') {
          log(`Create blocked (${dt}ms): active game exists. Use "Join" with this code: ${out.code}`);
          if (els.joinCode && out.code) els.joinCode.value = out.code;
          return;
        }
        log(`Create failed (${dt}ms)`); log(out); return;
      }
      log(`Create ok (${dt}ms)`); applyGame(out); startHeartbeat(); log(out);
    } catch (e) {
      log('Create error: ' + e.message);
    }
  }
  if (els.createGameBtn) els.createGameBtn.addEventListener('click', createGame);

  // -------- Start Game (idempotent) --------
  async function startGame(){
    if (!state.session?.access_token) { log('Please login first'); return; }
    if (!state.gameId) { log('No game to start. Click Create Game first.'); return; }
    if (hostTimerActive()) { log('Game is already running.'); return; }
    const url = state.functionsBase + '/start_game';
    try {
      const t0 = performance.now();
      const r = await fetch(url, {
        method:'POST',
        headers:{ 'authorization':'Bearer ' + state.session.access_token, 'content-type':'application/json' },
        body: JSON.stringify({ gameId: state.gameId })
      });
      const dt = Math.round(performance.now() - t0);
      const out = await r.json().catch(()=>({}));
      if (!r.ok) { log(`Start failed (${dt}ms)`); log(out); return; }
      log(`Start ok (${dt}ms)`); applyGame(out.game || out); startHeartbeat(); log(out);
    } catch (e) {
      log('Start error: ' + e.message);
    }
  }
  if (els.startGameBtn) els.startGameBtn.addEventListener('click', startGame);

  // -------- End Game & analyze (host) --------
  async function endGame(){
    if (!state.session?.access_token) { log('Please login first'); return; }
    if (!state.gameId) { log('No game created'); return; }
    const base = state.functionsBase + '/end_game_and_analyze';
    try {
      const t0 = performance.now();
      const r = await fetch(base, {
        method:'POST',
        headers:{ 'authorization':'Bearer ' + state.session.access_token, 'content-type':'application/json' },
        body: JSON.stringify({ gameId: state.gameId, code: state.gameCode })
      });
      const dt = Math.round(performance.now() - t0);
      const out = await r.json().catch(()=>({}));
      if (!r.ok) { log(`End failed (${dt}ms)`); log(out); return; }
      log(`End ok (${dt}ms)`); log(out);

      // Reset host UI
      stopHeartbeat();
      clearHostCountdown();
      setText(els.statusOut, 'ended');
      state.gameId = null; state.gameCode = null; state.status = 'ended';
      setText(els.gameIdOut, '—'); setText(els.gameCodeOut, '—'); setText(els.endsAtOut, '—');
      if (els.startGameBtn) els.startGameBtn.disabled = false;
      if (els.nextCardBtn)  els.nextCardBtn.disabled  = true;
      setText(els.questionText, '—'); setText(els.questionClar, '');
    } catch (e) {
      log('End error: ' + e.message);
    }
  }
  if (els.endAnalyzeBtn) els.endAnalyzeBtn.addEventListener('click', endGame);

  // -------- Reveal next card (host) --------
  async function revealNext(){
    if (!state.session?.access_token) { log('Please login first'); return; }
    if (!state.gameId) { log('No game active'); return; }
    // NOTE: we allow reveal even if timer hit 00:00 locally; backend will check status.
    const url = state.functionsBase + '/next_question';
    try {
      const t0 = performance.now();
      const r = await fetch(url, {
        method:'POST',
        headers:{ 'authorization':'Bearer ' + state.session.access_token, 'content-type':'application/json' },
        body: JSON.stringify({ gameId: state.gameId })
      });
      const dt = Math.round(performance.now() - t0);
      const out = await r.json().catch(()=>({}));
      if (!r.ok) {
        log(`Next card failed (${dt}ms)`); log(out);
        if ((out?.error||'') === 'no_more_questions') {
          const fallback = {
            text: 'Warm-up: Share a small joy from this week.',
            clarification: 'Think of a tiny win or a moment that made you smile.'
          };
          setText(els.questionText, fallback.text);
          setText(els.questionClar, fallback.clarification);
        }
        return;
      }
      log(`Next card ok (${dt}ms)`); log(out);
      const q = out.question || {};
      setText(els.questionText, q.text || '—');
      setText(els.questionClar, q.clarification || '');
    } catch (e) {
      log('Next card error: ' + e.message);
    }
  }
  if (els.nextCardBtn) els.nextCardBtn.addEventListener('click', revealNext);

  // -------- Guest join & polling (by 6-digit code) --------
  function stopGuestPolling(){
    if (state.guestPollHandle){ clearInterval(state.guestPollHandle); state.guestPollHandle = null; }
  }

  function stopGuestCountdown(){
    clearGuestCountdown();
  }

  async function pollGuestStateOnce(){
    if (!state.functionsBase || !state.guestCode) return;
    try {
      const r = await fetch(state.functionsBase + '/get_state?code=' + encodeURIComponent(state.guestCode));
      const out = await r.json().catch(()=>({}));

      // Question
      const q = out?.question;
      setText(els.gQuestionText, q?.text || '—');
      setText(els.gQuestionClar, q?.clarification || '');

      // Timer
      const endsIso = out?.ends_at || null;
      if (endsIso) startCountdown('guest', endsIso);
      else stopGuestCountdown();
    } catch {}
  }

  function startGuestPolling(){
    stopGuestPolling();            // <-- only stops polling, not countdown
    pollGuestStateOnce();
    state.guestPollHandle = setInterval(pollGuestStateOnce, 3000); // 3s polling
  }

  if (els.joinRoomBtn) els.joinRoomBtn.addEventListener('click', async ()=>{
    const name = (els.guestName?.value || '').trim();
    const code = (els.joinCode?.value || '').trim();
    if (!code){ if (els.joinLog) els.joinLog.textContent = 'Enter the 6-digit code'; return; }
    state.guestCode = code;

    // Start polling immediately—so guests (and returning host) see updates in near real-time
    startGuestPolling();

    // Optional: register presence server-side (won't affect polling)
    try {
      const url = state.functionsBase + '/join_game_guest';
      const t0 = performance.now();
      const r = await fetch(url, { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ name, code }) });
      const dt = Math.round(performance.now() - t0);
      const out = await r.json().catch(()=>({}));
      if (!r.ok){ if (els.joinLog) els.joinLog.textContent = `Join failed (${dt}ms): ` + JSON.stringify(out); return; }
      if (els.joinLog) els.joinLog.textContent = `Join ok (${dt}ms): ` + JSON.stringify(out, null, 2);
    } catch (e) {
      if (els.joinLog) els.joinLog.textContent = 'Join error: ' + e.message;
    }
  });

})();
