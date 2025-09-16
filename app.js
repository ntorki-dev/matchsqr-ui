(function(){
  const $ = (id) => document.getElementById(id);
  const logEl = $('hostLog');
  const log = (msg) => {
    if (!logEl) return;
    const text = (typeof msg === 'string') ? msg : JSON.stringify(msg, null, 2);
    logEl.textContent = (logEl.textContent ? logEl.textContent + "\n" : "") + text;
    logEl.scrollTop = logEl.scrollHeight;
  };
  const setText = (el, v) => { if (el) el.textContent = v; };

  const els = {
    home: $('homeSection'), host: $('hostSection'), join: $('joinSection'),
    btnHome: $('btnHome'), hostBtn: $('hostBtn'), joinBtn: $('joinBtn'),
    hostLoginForm: $('hostLoginForm'), hostEmail: $('hostEmail'), hostPassword: $('hostPassword'),
    createOrResumeBtn: $('createOrResumeBtn'), startGameBtn: $('startGameBtn'), endAnalyzeBtn: $('endAnalyzeBtn'),
    gameIdOut: $('gameIdOut'), gameCodeOut: $('gameCodeOut'),
    statusOut: $('statusOut'), endsAtOut: $('endsAtOut'), timeLeft: $('timeLeft'),
    nextCardBtn: $('nextCardBtn'), questionText: $('questionText'), questionClar: $('questionClar'),
    guestName: $('guestName'), joinCode: $('joinCode'), joinRoomBtn: $('joinRoomBtn'), joinLog: $('joinLog')
  };

  const state = {
    supa: null, session: null,
    functionsBase: null,
    gameId: null, gameCode: null, status: null, endsAt: null,
    timerHandle: null
  };

  const show = (el)=> el && el.classList.remove('hidden');
  const hide = (el)=> el && el.classList.add('hidden');

  if (els.btnHome) els.btnHome.onclick = () => { show(els.home); hide(els.host); hide(els.join); };
  if (els.hostBtn) els.hostBtn.onclick = () => { hide(els.home); show(els.host); hide(els.join); };
  if (els.joinBtn) els.joinBtn.onclick = () => { hide(els.home); hide(els.host); show(els.join); };

  // CONFIG
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

  // TIMER
  function clearCountdown(){
    if (state.timerHandle){ clearInterval(state.timerHandle); state.timerHandle = null; }
    setText(els.timeLeft, '—'); state.endsAt = null;
  }
  function startCountdown(iso){
    clearCountdown();
    if (!iso) return;
    const endsAt = new Date(iso);
    state.endsAt = endsAt;
    function tick(){
      const ms = endsAt - Date.now();
      if (ms <= 0){
        setText(els.timeLeft, '00:00:00');
        clearInterval(state.timerHandle); state.timerHandle = null;
        log('Time finished. You can end the game & analyze.');
        return;
      }
      const s  = Math.floor(ms/1000);
      const hh = String(Math.floor(s/3600)).padStart(2,'0');
      const mm = String(Math.floor((s%3600)/60)).padStart(2,'0');
      const ss = String(s%60).padStart(2,'0');
      setText(els.timeLeft, `${hh}:${mm}:${ss}`);
    }
    state.timerHandle = setInterval(tick, 1000);
    tick();
  }

  function timerIsActive(){
    return state.status === 'running' && state.endsAt && state.endsAt.getTime() > Date.now();
  }

  function applyGame(g){
    if (!g) return;
    state.gameId   = g.id || g.game_id || state.gameId;
    state.gameCode = g.code || state.gameCode;
    state.status   = g.status || state.status;

    const ends = (g.status === 'running') ? g.ends_at : null;

    setText(els.gameIdOut,   state.gameId  || '—');
    setText(els.gameCodeOut, state.gameCode|| '—');
    setText(els.statusOut,   state.status  || '—');
    setText(els.endsAtOut,   ends          || '—');

    if (ends) startCountdown(ends); else clearCountdown();

    // Only disable Start when a valid running timer exists
    if (els.startGameBtn) els.startGameBtn.disabled = timerIsActive();
    if (els.nextCardBtn)  els.nextCardBtn.disabled  = (state.status !== 'running');
  }

  // AUTH
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

  // CREATE/RESUME
  async function createOrResume(){
    if (!state.session?.access_token) { log('Please login first'); return; }
    const url = state.functionsBase + '/create_game';
    try {
      const t0 = performance.now();
      const r = await fetch(url, { method:'POST', headers:{ 'authorization':'Bearer ' + state.session.access_token } });
      const dt = Math.round(performance.now() - t0);
      const out = await r.json().catch(()=>({}));
      if (!r.ok) { log(`Create/resume failed (${dt}ms)`); log(out); return; }
      log(`Create/resume ok (${dt}ms)`); applyGame(out); log(out);
    } catch (e) { log('Create/resume error: ' + e.message); }
  }
  if (els.createOrResumeBtn) els.createOrResumeBtn.addEventListener('click', createOrResume);

  // START (call backend if NO active timer, even if status text says "running")
  async function startGame(){
    if (!state.session?.access_token) { log('Please login first'); return; }
    if (!state.gameId) { log('No game to start. Click Create/Resume first.'); return; }
    if (timerIsActive()) { log('Game is already running.'); return; } // only block when timer valid

    const url = state.functionsBase + '/start_game';
    try {
      const t0 = performance.now();
      const r = await fetch(url, {
        method:'POST',
        headers:{ 'authorization': 'Bearer ' + state.session.access_token, 'content-type':'application/json' },
        body: JSON.stringify({ gameId: state.gameId })
      });
      const dt = Math.round(performance.now() - t0);
      const out = await r.json().catch(()=>({}));
      if (!r.ok) { log(`Start failed (${dt}ms)`); log(out); return; }
      log(`Start ok (${dt}ms)`); applyGame(out.game || out); log(out);
    } catch (e) { log('Start error: ' + e.message); }
  }
  if (els.startGameBtn) els.startGameBtn.addEventListener('click', startGame);

  // END
  async function endGame(){
    if (!state.session?.access_token) { log('Please login first'); return; }
    if (!state.gameId) { log('No game created'); return; }
    const base = state.functionsBase + '/end_game_and_analyze';
    try {
      let t0 = performance.now();
      let r = await fetch(base, {
        method:'POST',
        headers:{ 'authorization':'Bearer ' + state.session.access_token, 'content-type':'application/json' },
        body: JSON.stringify({ gameId: state.gameId, code: state.gameCode })
      });
      let dt = Math.round(performance.now() - t0);
      let out = await r.json().catch(()=>({}));
      if (!r.ok && (out?.error||'').toLowerCase().includes('missing_game_id')){
        const qs = new URLSearchParams({ gameId:String(state.gameId), code:String(state.gameCode||'') });
        t0 = performance.now();
        r = await fetch(base + '?' + qs.toString(), { method:'POST', headers:{ 'authorization': 'Bearer ' + state.session.access_token } });
        dt = Math.round(performance.now() - t0);
        out = await r.json().catch(()=>({}));
      }
      if (!r.ok) { log(`End failed (${dt}ms)`); log(out); return; }
      log(`End ok (${dt}ms)`); log(out);

      // Reset UI so next Create yields a fresh id
      clearCountdown(); setText(els.statusOut,'ended');
      state.gameId = null; state.gameCode = null;
      setText(els.gameIdOut,'—'); setText(els.gameCodeOut,'—');
      if (els.startGameBtn) els.startGameBtn.disabled = false;
      if (els.nextCardBtn)  els.nextCardBtn.disabled  = true;
      setText(els.questionText, '—'); setText(els.questionClar, '');
    } catch (e) { log('End error: ' + e.message); }
  }
  if (els.endAnalyzeBtn) els.endAnalyzeBtn.addEventListener('click', endGame);

  // Reveal next card (with safe fallback if DB is empty)
  async function revealNext(){
    if (!state.session?.access_token) { log('Please login first'); return; }
    if (!state.gameId) { log('No game active'); return; }
    if (!timerIsActive()) { log('Start the game first.'); return; }

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
      if (!r.ok){
        log(`Next card failed (${dt}ms)`); log(out);
        if ((out?.error||'') === 'no_more_questions'){
          // Safe fallback to keep the flow moving
          const q = {
            id: 'sample-warmup',
            text: 'Warm-up: Share a small joy from this week.',
            clarification: 'Think of a tiny win or a moment that made you smile.'
          };
          setText(els.questionText, q.text);
          setText(els.questionClar, q.clarification || '');
          log('Using sample fallback question (seed your questions table to replace this).');
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

  // GUEST JOIN
  if (els.joinRoomBtn) els.joinRoomBtn.addEventListener('click', async ()=>{
    const name = (els.guestName.value||'').trim();
    const code = (els.joinCode.value||'').trim();
    if (!name || !code){ if (els.joinLog) els.joinLog.textContent = 'Enter name and Game ID'; return; }
    const url = state.functionsBase + '/join_game_guest';
    try {
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
