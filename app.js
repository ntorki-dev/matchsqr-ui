(function(){
  const $ = (id) => document.getElementById(id);
  const logEl = $('hostLog');
  const log = (msg) => { if (!logEl) return; const t = typeof msg==='string'?msg:JSON.stringify(msg,null,2); logEl.textContent = (logEl.textContent?logEl.textContent+"\n":"")+t; logEl.scrollTop = logEl.scrollHeight; };
  const setText = (el,v)=>{ if(el) el.textContent = v; };

  // Elements
  const els = {
    home: $('homeSection'), host: $('hostSection'), join: $('joinSection'),
    btnHome: $('btnHome'), hostBtn: $('hostBtn'), joinBtn: $('joinBtn'),
    hostLoginForm: $('hostLoginForm'), hostEmail: $('hostEmail'), hostPassword: $('hostPassword'),
    createGameBtn: $('createGameBtn'), startGameBtn: $('startGameBtn'), nextCardBtn: $('nextCardBtn'), endAnalyzeBtn: $('endAnalyzeBtn'),
    gameIdOut: $('gameIdOut'), gameCodeOut: $('gameCodeOut'), statusOut: $('statusOut'), endsAtOut: $('endsAtOut'), timeLeft: $('timeLeft'),
    hostPeople: $('hostPeople'),
    questionText: $('questionText'), questionClar: $('questionClar'),
    guestName: $('guestName'), joinCode: $('joinCode'), joinRoomBtn: $('joinRoomBtn'),
    gStatus: $('gStatus'), gEndsAt: $('gEndsAt'), gTimeLeft: $('gTimeLeft'),
    guestPeople: $('guestPeople'),
    gQuestionText: $('gQuestionText'), gQuestionClar: $('gQuestionClar'),
    joinLog: $('joinLog')
  };

  // State
  const state = {
    supa: null, session: null, functionsBase: null,
    gameId: null, gameCode: null, status: null, endsAt: null,
    // timers/loops
    hostCountdownHandle: null, heartbeatHandle: null,
    guestCode: null, guestPollHandle: null, guestCountdownHandle: null,
    isHostInJoin: false
  };

  // Navigation
  const show = (el)=> el && (el.style.display = '');
  const hide = (el)=> el && (el.style.display = 'none');
  if (els.btnHome) els.btnHome.onclick = ()=>{ show(els.home); hide(els.host); hide(els.join); };
  if (els.hostBtn) els.hostBtn.onclick = ()=>{ hide(els.home); show(els.host); hide(els.join); };
  if (els.joinBtn) els.joinBtn.onclick = ()=>{ hide(els.home); hide(els.host); show(els.join); };

  // Config/Supabase
  async function loadConfig(){
    const baseRaw = (window.CONFIG && window.CONFIG.FUNCTIONS_BASE) || '';
    const base = baseRaw.replace(/\/$/, '');
    if (!base){ log('Please set FUNCTIONS_BASE in config.js'); return; }
    state.functionsBase = base;
    try{
      const r = await fetch(base + '/config'); const text = await r.text();
      let cfg; try{ cfg = JSON.parse(text); }catch{ cfg = {}; }
      const url  = cfg.supabase_url || cfg.public_supabase_url || cfg.url  || (window.CONFIG && window.CONFIG.FALLBACK_SUPABASE_URL);
      const anon = cfg.supabase_anon_key || cfg.public_supabase_anon_key || cfg.anon || (window.CONFIG && window.CONFIG.FALLBACK_SUPABASE_ANON_KEY);
      if (!url || !anon) throw new Error('Missing supabase url/anon');
      state.supa = window.supabase.createClient(url, anon);
      log('Supabase client initialized.');
    }catch(e){ log('Config error: '+e.message); }
  }
  loadConfig();

  // ---- countdown helpers ----
  function clearHostCountdown(){ if(state.hostCountdownHandle){ clearInterval(state.hostCountdownHandle); state.hostCountdownHandle=null; } setText(els.timeLeft,'—'); state.endsAt=null; }
  function startHostCountdown(iso){
    clearHostCountdown(); if (!iso) return;
    state.endsAt = new Date(iso);
    function tick(){
      const ms = state.endsAt - Date.now(); const s=Math.max(0,Math.floor(ms/1000));
      const hh=String(Math.floor(s/3600)).padStart(2,'0'), mm=String(Math.floor((s%3600)/60)).padStart(2,'0'), ss=String(s%60).padStart(2,'0');
      setText(els.timeLeft, `${hh}:${mm}:${ss}`);
      if (ms<=0) clearHostCountdown();
    }
    state.hostCountdownHandle = setInterval(tick,1000); tick();
  }
  function clearGuestCountdown(){ if(state.guestCountdownHandle){ clearInterval(state.guestCountdownHandle); state.guestCountdownHandle=null; } setText(els.gTimeLeft,'—'); }
  function startGuestCountdown(iso){
    clearGuestCountdown(); if (!iso) return;
    const ends = new Date(iso);
    function tick(){
      const ms = ends - Date.now(); const s=Math.max(0,Math.floor(ms/1000));
      const hh=String(Math.floor(s/3600)).padStart(2,'0'), mm=String(Math.floor((s%3600)/60)).padStart(2,'0'), ss=String(s%60).padStart(2,'0');
      setText(els.gTimeLeft, `${hh}:${mm}:${ss}`);
      if (ms<=0) clearGuestCountdown();
    }
    state.guestCountdownHandle = setInterval(tick,1000); tick();
  }

  // ---- heartbeat ----
  function stopHeartbeat(){ if(state.heartbeatHandle){ clearInterval(state.heartbeatHandle); state.heartbeatHandle=null; } }
  function startHeartbeat(){
    stopHeartbeat();
    const beat = ()=> {
      if (!state.session?.access_token || !state.gameId) return;
      fetch(state.functionsBase + '/heartbeat', {
        method:'POST',
        headers:{ 'authorization':'Bearer '+state.session.access_token, 'content-type':'application/json' },
        body: JSON.stringify({ gameId: state.gameId })
      }).catch(()=>{});
    };
    state.heartbeatHandle = setInterval(beat, 20000);
    beat();
  }

  // ---- host UI apply ----
  function applyHostGame(g){
    if(!g) return;
    state.gameId = g.id || g.game_id || state.gameId;
    state.gameCode = g.code || state.gameCode;
    state.status = g.status || state.status;
    const endsIso = (state.status==='running') ? (g.ends_at || g.endsAt || null) : null;

    setText(els.gameIdOut, state.gameId || '—'); setText(els.gameCodeOut, state.gameCode || '—');
    setText(els.statusOut, state.status || '—'); setText(els.endsAtOut, endsIso || '—');
    if (endsIso) startHostCountdown(endsIso); else clearHostCountdown();

    els.startGameBtn.disabled = !!(state.status==='running' && endsIso);
  }

  async function refreshHostPeople(){
    if (!state.functionsBase || !state.gameCode) return;
    try{
      const r = await fetch(state.functionsBase + '/get_state?code=' + encodeURIComponent(state.gameCode));
      const out = await r.json().catch(()=>({}));
      const ppl = out?.participants || [];
      els.hostPeople.innerHTML = ppl.map(p=>`<li>${p.name} <span class="meta">(${p.role})</span></li>`).join('') || '<li class="meta">No one yet</li>';
      // mirror current card too (host always sees same)
      const q = out?.question;
      setText(els.questionText, q?.text || '—');
      setText(els.questionClar, q?.clarification || '');
    }catch{}
  }

  // ---- auth ----
  if (els.hostLoginForm) els.hostLoginForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (!state.supa) { log('Supabase client not ready yet.'); return; }
    const email=(els.hostEmail.value||'').trim(), password=els.hostPassword.value||'';
    const { data, error } = await state.supa.auth.signInWithPassword({ email, password });
    if (error){ log('Login failed: '+error.message); return; }
    state.session = data.session; log('Login ok');
  });

  // ---- create ----
  if (els.createGameBtn) els.createGameBtn.addEventListener('click', async ()=>{
    if (!state.session?.access_token){ log('Please login first'); return; }
    const r = await fetch(state.functionsBase + '/create_game', { method:'POST', headers:{ 'authorization':'Bearer '+state.session.access_token }});
    const out = await r.json().catch(()=>({}));
    if (!r.ok){
      if (out?.error==='host_has_active_game'){ log('Active game exists, use Join with this code: '+out.code); if(els.joinCode) els.joinCode.value = out.code; }
      else { log('Create failed'); log(out); }
      return;
    }
    log('Create ok'); applyHostGame(out); startHeartbeat(); await refreshHostPeople();
  });

  // ---- start ----
  if (els.startGameBtn) els.startGameBtn.addEventListener('click', async ()=>{
    if (!state.session?.access_token){ log('Please login first'); return; }
    if (!state.gameId){ log('No game to start'); return; }
    const r = await fetch(state.functionsBase + '/start_game', {
      method:'POST',
      headers:{ 'authorization':'Bearer '+state.session.access_token, 'content-type':'application/json' },
      body: JSON.stringify({ gameId: state.gameId })
    });
    const out = await r.json().catch(()=>({}));
    if (!r.ok){ log('Start failed'); log(out); return; }
    log('Start ok'); applyHostGame(out.game||out); startHeartbeat(); await refreshHostPeople();
  });

  // ---- next card ----
  if (els.nextCardBtn) els.nextCardBtn.addEventListener('click', async ()=>{
    if (!state.session?.access_token){ log('Please login first'); return; }
    if (!state.gameId){ log('No game active'); return; }
    const r = await fetch(state.functionsBase + '/next_question', {
      method:'POST',
      headers:{ 'authorization':'Bearer '+state.session.access_token, 'content-type':'application/json' },
      body: JSON.stringify({ gameId: state.gameId })
    });
    const out = await r.json().catch(()=>({}));
    if (!r.ok){ log('Next card failed'); log(out);
      if ((out?.error||'')==='no_more_questions'){
        setText(els.questionText,'Warm-up: Share a small joy from this week.');
        setText(els.questionClar,'Think of a tiny win or a moment that made you smile.');
      }
      return;
    }
    const q = out.question || {};
    setText(els.questionText, q.text || '—'); setText(els.questionClar, q.clarification || '');
    await refreshHostPeople();
  });

  // ---- end ----
  if (els.endAnalyzeBtn) els.endAnalyzeBtn.addEventListener('click', async ()=>{
    if (!state.session?.access_token){ log('Please login first'); return; }
    if (!state.gameId){ log('No game created'); return; }
    const r = await fetch(state.functionsBase + '/end_game_and_analyze', {
      method:'POST',
      headers:{ 'authorization':'Bearer '+state.session.access_token, 'content-type':'application/json' },
      body: JSON.stringify({ gameId: state.gameId, code: state.gameCode })
    });
    const out = await r.json().catch(()=>({}));
    if (!r.ok){ log('End failed'); log(out); return; }
    log('End ok'); log(out);
    stopHeartbeat(); clearHostCountdown();
    state.gameId=null; state.gameCode=null; state.status='ended';
    setText(els.gameIdOut,'—'); setText(els.gameCodeOut,'—'); setText(els.statusOut,'ended'); setText(els.endsAtOut,'—');
    setText(els.questionText,'—'); setText(els.questionClar,'');
    els.startGameBtn.disabled = false;
  });

  // ---- guest/join (also used by returning host) ----
  function stopGuestPolling(){ if (state.guestPollHandle){ clearInterval(state.guestPollHandle); state.guestPollHandle=null; } }
  function startGuestPolling(){
    stopGuestPolling();
    state.guestPollHandle = setInterval(pollGuestStateOnce, 3000);
    pollGuestStateOnce();
  }

  async function pollGuestStateOnce(){
    if (!state.functionsBase || !state.guestCode) return;
    try{
      const r = await fetch(state.functionsBase + '/get_state?code=' + encodeURIComponent(state.guestCode));
      const out = await r.json().catch(()=>({}));
      setText(els.gStatus, out?.status || '—'); setText(els.gEndsAt, out?.ends_at || '—');
      const q = out?.question; setText(els.gQuestionText, q?.text || '—'); setText(els.gQuestionClar, q?.clarification || '');
      const ppl = out?.participants || [];
      els.guestPeople.innerHTML = ppl.map(p=>`<li>${p.name} <span class="meta">(${p.role})</span></li>`).join('') || '<li class="meta">No one yet</li>';
      if (out?.ends_at) startGuestCountdown(out.ends_at); else clearGuestCountdown();

      // If returning host joined here, mirror host UI fields too
      if (state.isHostInJoin){
        setText(els.statusOut, out?.status || '—'); setText(els.endsAtOut, out?.ends_at || '—');
        if (out?.ends_at) startHostCountdown(out.ends_at);
        // also mirror participants + card into host pane for visibility
        els.hostPeople.innerHTML = els.guestPeople.innerHTML;
        setText(els.questionText, q?.text || '—'); setText(els.questionClar, q?.clarification || '');
      }
    }catch{}
  }

  if (els.joinRoomBtn) els.joinRoomBtn.addEventListener('click', async ()=>{
    const name = (els.guestName?.value || '').trim();
    const code = (els.joinCode?.value || '').trim();
    if (!code){ if (els.joinLog) els.joinLog.textContent = 'Enter the 6-digit code'; return; }
    state.guestCode = code;

    // Try the auth-aware join (returns is_host if bearer is host)
    let isHost = false;
    try{
      const headers = { 'content-type':'application/json' };
      if (state.session?.access_token) headers['authorization'] = 'Bearer ' + state.session.access_token;
      const r = await fetch(state.functionsBase + '/join_game', { method:'POST', headers, body: JSON.stringify({ code, name }) });
      const out = await r.json().catch(()=>({}));
      if (!r.ok){ if (els.joinLog) els.joinLog.textContent = 'Join failed: ' + JSON.stringify(out); return; }
      // Set host mirror if host rejoined via Join
      isHost = !!out?.is_host;
      state.isHostInJoin = isHost;
      if (isHost){
        // Attach control to host pane (we already have login session)
        state.gameId = out.game_id || state.gameId;
        state.gameCode = code;
        setText(els.gameIdOut, state.gameId || '—'); setText(els.gameCodeOut, code);
      }
      if (els.joinLog) els.joinLog.textContent = 'Joined: ' + JSON.stringify({ is_host:isHost, game_id: out?.game_id }, null, 2);
    }catch(e){
      if (els.joinLog) els.joinLog.textContent = 'Join error: ' + e.message;
    }

    // Start polling for state shared across everyone
    startGuestPolling();

    // For guests, keep presence alive
    if (!isHost && name){
      setInterval(()=>{
        fetch(state.functionsBase + '/participant_heartbeat', {
          method:'POST', headers:{ 'content-type':'application/json' },
          body: JSON.stringify({ gameId: state.gameId, code, name })
        }).catch(()=>{});
      }, 25000);
    }
  });

})();
