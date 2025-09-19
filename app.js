 (function(){
  const $ = (id) => document.getElementById(id);
  const logEl = $('hostLog');
  const log = (msg) => { if (!logEl) return; const t = typeof msg==='string'?msg:JSON.stringify(msg,null,2); logEl.textContent=(logEl.textContent?logEl.textContent+"\n":"")+t; logEl.scrollTop=logEl.scrollHeight; };
  const setText = (el,v)=>{ if(el) el.textContent=v; };

  // Elements
  const els = {
    home: $('homeSection'), host: $('hostSection'), join: $('joinSection'),
    btnHome: $('btnHome'), hostBtn: $('hostBtn'), joinBtn: $('joinBtn'),
    hostLoginForm: $('hostLoginForm'), hostEmail: $('hostEmail'), hostPassword: $('hostPassword'),
    createGameBtn: $('createGameBtn'), startGameBtn: $('startGameBtn'), nextCardBtn: $('nextCardBtn'), endAnalyzeBtn: $('endAnalyzeBtn'),
    gameIdOut: $('gameIdOut'), gameCodeOut: $('gameCodeOut'), statusOut: $('statusOut'), endsAtOut: $('endsAtOut'), timeLeft: $('timeLeft'),
    hostPeople: $('hostPeople'), hostPeopleCount: $('hostPeopleCount'),
    questionText: $('questionText'), questionClar: $('questionClar'),
    guestName: $('guestName'), joinCode: $('joinCode'), joinRoomBtn: $('joinRoomBtn'),
    gStatus: $('gStatus'), gEndsAt: $('gEndsAt'), gTimeLeft: $('gTimeLeft'),
    guestPeople: $('guestPeople'), guestPeopleCount: $('guestPeopleCount'),
    gQuestionText: $('gQuestionText'), gQuestionClar: $('gQuestionClar'),
    joinLog: $('joinLog')
  };

  // Minimal, robust show/hide (fix for Join blank screen)
  const show = (el)=>{ if(!el) return; el.classList.remove('hidden'); el.style.display=''; };
  const hide = (el)=>{ if(!el) return; el.classList.add('hidden'); el.style.display='none'; };
  if (els.btnHome) els.btnHome.onclick = ()=>{ show(els.home); hide(els.host); hide(els.join); };
  if (els.hostBtn) els.hostBtn.onclick = ()=>{ hide(els.home); show(els.host); hide(els.join); };
  if (els.joinBtn) els.joinBtn.onclick = ()=>{ hide(els.home); hide(els.host); show(els.join); };

  // State

  // Per-room temp id for guest submissions (for submit_answer compatibility)
  function getTempPlayerId(code){
    try{
      const k='ms_temp_'+code;
      let v=localStorage.getItem(k);
      if(!v){ v=crypto.randomUUID(); localStorage.setItem(k,v); }
      return v;
    }catch{ return null; }
  }

  const state = {
    supa: null, session: null, functionsBase: null,
    gameId: null, gameCode: null, status: null, endsAt: null,
    hostCountdownHandle: null, heartbeatHandle: null,
    roomPollHandle: null,
    isHostInJoin: false
  };

  // Config/Supabase
  async function loadConfig(){
    const baseRaw=(window.CONFIG&&window.CONFIG.FUNCTIONS_BASE)||''; const base=baseRaw.replace(/\/$/,'');
    if(!base){ log('Please set FUNCTIONS_BASE in config.js'); return; }
    state.functionsBase = base;
    try{
      const r=await fetch(base+'/config'); const text=await r.text(); let cfg; try{ cfg=JSON.parse(text);}catch{cfg={};}
      const url=cfg.supabase_url||cfg.public_supabase_url||cfg.url||(window.CONFIG&&window.CONFIG.FALLBACK_SUPABASE_URL);
      const anon=cfg.supabase_anon_key||cfg.public_supabase_anon_key||cfg.anon||(window.CONFIG&&window.CONFIG.FALLBACK_SUPABASE_ANON_KEY);
      if(!url||!anon) throw new Error('Missing supabase url/anon');
      state.supa=window.supabase.createClient(url,anon); log('Supabase client initialized.');
    }catch(e){ log('Config error: '+e.message); }
  }
  loadConfig();

  // Countdowns
  function clearHostCountdown(){ if(state.hostCountdownHandle){ clearInterval(state.hostCountdownHandle); state.hostCountdownHandle=null; } setText(els.timeLeft,'—'); state.endsAt=null; }
  function startHostCountdown(iso){ clearHostCountdown(); if(!iso) return; state.endsAt=new Date(iso);
    function tick(){ const ms=state.endsAt-Date.now(); const s=Math.max(0,Math.floor(ms/1000)); const hh=String(Math.floor(s/3600)).padStart(2,'0'); const mm=String(Math.floor((s%3600)/60)).padStart(2,'0'); const ss=String(s%60).padStart(2,'0'); setText(els.timeLeft,`${hh}:${mm}:${ss}`); if(ms<=0) clearHostCountdown(); }
    state.hostCountdownHandle=setInterval(tick,1000); tick(); }
  function startGuestCountdown(iso){ if(!iso){ setText(els.gTimeLeft,'—'); return; } const ends=new Date(iso);
    function tick(){ const ms=ends-Date.now(); const s=Math.max(0,Math.floor(ms/1000)); const hh=String(Math.floor(s/3600)).padStart(2,'0'); const mm=String(Math.floor((s%3600)/60)).padStart(2,'0'); const ss=String(s%60).padStart(2,'0'); setText(els.gTimeLeft,`${hh}:${mm}:${ss}`); }
    tick(); }

  const hostTimerActive = ()=> state.status==='running' && state.endsAt && state.endsAt.getTime()>Date.now();

  // Heartbeat (host)
  function stopHeartbeat(){ if(state.heartbeatHandle){ clearInterval(state.heartbeatHandle); state.heartbeatHandle=null; } }
  function startHeartbeat(){
    stopHeartbeat();
    const beat=()=>{ if(!state.session?.access_token||!state.gameId) return;
      fetch(state.functionsBase+'/heartbeat',{method:'POST',headers:{'authorization':'Bearer '+state.session.access_token,'content-type':'application/json'},body:JSON.stringify({gameId:state.gameId})}).catch(()=>{});
    };
    state.heartbeatHandle=setInterval(beat,20000); beat();
  }

  // Shared room polling
  function stopRoomPolling(){ if(state.roomPollHandle){ clearInterval(state.roomPollHandle); state.roomPollHandle=null; } }
  async function pollRoomStateOnce(){
    if(!state.functionsBase || !state.gameCode) return;
    const r = await fetch(state.functionsBase + '/get_state?code=' + encodeURIComponent(state.gameCode));
    const out = await r.json().catch(()=>({}));
    // Card
    const q = out?.question; setText(els.questionText, q?.text || '—'); setText(els.questionClar, q?.clarification || '');
    setText(els.gQuestionText, q?.text || '—'); setText(els.gQuestionClar, q?.clarification || '');
    // Timer/status
    const endsIso = out?.ends_at || null;
    setText(els.statusOut, out?.status || '—'); setText(els.endsAtOut, endsIso || '—');
    setText(els.gStatus, out?.status || '—'); setText(els.gEndsAt, endsIso || '—');
    if(endsIso){ startHostCountdown(endsIso); startGuestCountdown(endsIso); }
    // Participants + counts
    const ppl = out?.participants || [];
    els.hostPeople.innerHTML  = ppl.map(p=>`<li>${p.name} <span class="meta">(${p.role})</span></li>`).join('') || '<li class="meta">No one yet</li>';
    els.guestPeople.innerHTML = els.hostPeople.innerHTML;
    const count = Array.isArray(ppl) ? ppl.length : 0;
    if (els.hostPeopleCount) els.hostPeopleCount.textContent = String(count);
    if (els.guestPeopleCount) els.guestPeopleCount.textContent = String(count);
  }
  function startRoomPolling(){ stopRoomPolling(); state.roomPollHandle=setInterval(pollRoomStateOnce,3000); pollRoomStateOnce(); startGameRealtime(); }

  // Apply game to host UI
  function applyHostGame(g){
    if(!g) return;
    state.gameId = g.id || g.game_id || state.gameId;
    state.gameCode = g.code || state.gameCode;
    state.status = g.status || state.status;
    const endsIso = (state.status==='running') ? (g.ends_at || g.endsAt || null) : null;

    setText(els.gameIdOut, state.gameId || '—'); setText(els.gameCodeOut, state.gameCode || '—');
    setText(els.statusOut, state.status || '—'); setText(els.endsAtOut, endsIso || '—');
    if(endsIso) startHostCountdown(endsIso); else clearHostCountdown();
    els.startGameBtn.disabled = !!(state.status==='running' && endsIso);
    if (state.gameCode) startRoomPolling();
  }

  // Auth
  if (els.hostLoginForm) els.hostLoginForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!state.supa){ log('Supabase client not ready yet.'); return; }
    const email=(els.hostEmail.value||'').trim(), password=els.hostPassword.value||'';
    const { data, error } = await state.supa.auth.signInWithPassword({ email, password });
    if (error){ log('Login failed: '+error.message); return; }
    state.session = data.session; log('Login ok');
  });

  // Auto-join as host helper
  async function autoJoinAsHost(code){
    if(!code){ log('No code to join.'); return; }
    hide(els.home); hide(els.host); show(els.join);
    if (els.joinCode) els.joinCode.value = code;

    const headers = { 'content-type':'application/json' };
    if (state.session?.access_token) headers['authorization'] = 'Bearer ' + state.session.access_token;

    const r = await fetch(state.functionsBase + '/join_game_guest', {
      method:'POST', headers, body: JSON.stringify({ code })
    });
    const out = await r.json().catch(()=>({}));
    if (!r.ok){ if(els.joinLog) els.joinLog.textContent='Join failed: '+JSON.stringify(out); return; }

    try{ if(out?.participant_id && code){ localStorage.setItem('ms_pid_'+code, out.participant_id); } }catch{}
    const isHost = !!out?.is_host;
    if (!isHost){ if(els.joinLog) els.joinLog.textContent='This code belongs to an existing room, but you are not the host.'; return; }

    state.isHostInJoin = true;
    state.gameId  = out.game_id || state.gameId;
    state.gameCode = code;
    setText(els.gameIdOut, state.gameId || '—'); setText(els.gameCodeOut, code);
    log('Rejoined room as host via Join.');
    startHeartbeat();
    startRoomPolling();
  }

  // Create
  if (els.createGameBtn) els.createGameBtn.addEventListener('click', async ()=>{
    if(!state.session?.access_token){ log('Please login first'); return; }
    const r = await fetch(state.functionsBase + '/create_game', { method:'POST', headers:{ 'authorization':'Bearer '+state.session.access_token }});
    const out = await r.json().catch(()=>({}));
    if (!r.ok){
      if (out?.error === 'host_has_active_game'){
        log('Active game exists; auto-joining as host with code '+out.code);
        await autoJoinAsHost(out.code);
        return;
      }
      log('Create failed'); log(out); return;
    }
    log('Create ok'); applyHostGame(out); startHeartbeat();
  });

  // Start
  if (els.startGameBtn) els.startGameBtn.addEventListener('click', async ()=>{
    if(!state.session?.access_token){ log('Please login first'); return; }
    if(!state.gameId){ log('No game to start'); return; }
    const r = await fetch(state.functionsBase + '/start_game', {
      method:'POST',
      headers:{ 'authorization':'Bearer '+state.session.access_token, 'content-type':'application/json' },
      body: JSON.stringify({ gameId: state.gameId })
    });
    const out = await r.json().catch(()=>({}));
    if (!r.ok){ log('Start failed'); log(out); return; }
    log('Start ok'); applyHostGame(out.game||out);
  });

  // Reveal next
  if (els.nextCardBtn) els.nextCardBtn.addEventListener('click', async ()=>{
    if(!state.session?.access_token){ log('Please login first'); return; }
    if(!state.gameId){ log('No game active'); return; }
    const r = await fetch(state.functionsBase + '/next_question', {
      method:'POST',
      headers:{ 'authorization':'Bearer '+state.session.access_token, 'content-type':'application/json' },
      body: JSON.stringify({ gameId: state.gameId })
    });
    const out = await r.json().catch(()=>({}));
    if (!r.ok){ log('Next card failed'); log(out); return; }
    const q = out.question || {};
    setText(els.questionText, q.text || '—'); setText(els.questionClar, q.clarification || '');
  });

  // End
  if (els.endAnalyzeBtn) els.endAnalyzeBtn.addEventListener('click', async ()=>{
    if(!state.session?.access_token){ log('Please login first'); return; }
    if(!state.gameId && !state.gameCode){ log('No game created'); return; }
    const r = await fetch(state.functionsBase + '/end_game_and_analyze', {
      method:'POST',
      headers:{ 'authorization':'Bearer '+state.session.access_token, 'content-type':'application/json' },
      body: JSON.stringify({ gameId: state.gameId, code: state.gameCode })
    });
    const out = await r.json().catch(()=>({}));
    if (!r.ok){ log('End failed'); log(out); return; }
    log('End ok'); log(out);
    stopHeartbeat(); stopRoomPolling(); clearHostCountdown();
    state.gameId=null; state.gameCode=null; state.status='ended';
    setText(els.gameIdOut,'—'); setText(els.gameCodeOut,'—'); setText(els.statusOut,'ended'); setText(els.endsAtOut,'—');
    setText(els.questionText,'—'); setText(els.questionClar,'');
  });

  // Manual Join (guest or returning host)
  if (els.joinRoomBtn) els.joinRoomBtn.addEventListener('click', async ()=>{
    const code=(els.joinCode?.value||'').trim(); const name=(els.guestName?.value||'').trim();
    if (!code){ if(els.joinLog) els.joinLog.textContent='Enter the 6-digit code'; return; }

    const headers = { 'content-type':'application/json' };
    if (state.session?.access_token) headers['authorization']='Bearer '+state.session.access_token;

    const r = await fetch(state.functionsBase + '/join_game_guest', {
      method:'POST', headers, body: JSON.stringify({ code, name })
    });
    const out = await r.json().catch(()=>({}));
    if (!r.ok){ if(els.joinLog) els.joinLog.textContent='Join failed: '+JSON.stringify(out); return; }

    try{ if(out?.participant_id && code){ localStorage.setItem('ms_pid_'+code, out.participant_id); } }catch{}
    const isHost = !!out?.is_host;
    state.isHostInJoin = isHost;
    state.gameCode = code;

    if (isHost){
      state.gameId = out.game_id || state.gameId;
      setText(els.gameIdOut, state.gameId || '—'); setText(els.gameCodeOut, code);
      startHeartbeat();
    } else if (name){
      setInterval(()=>{ fetch(state.functionsBase + '/participant_heartbeat',{ method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ gameId: out?.game_id, name }) }).catch(()=>{}); }, 25000);
    }

    if(els.joinLog) els.joinLog.textContent='Joined: '+JSON.stringify({ is_host:isHost, game_id: out?.game_id }, null, 2);
    startRoomPolling();
  });


  // Realtime: subscribe to `public.games` row for current game_id and refresh on change
  async function resolveGameIdIfNeeded(){
    if (state.gameId || !state.functionsBase || !state.gameCode) return;
    try{
      const r = await fetch(state.functionsBase + '/get_state?code=' + encodeURIComponent(state.gameCode));
      const out = await r.json().catch(()=>({}));
      if (out && out.game_id) state.gameId = out.game_id;
    }catch{}
  }
  async function stopGameRealtime(){
    try{ if (state.gameChannel) await state.gameChannel.unsubscribe(); }catch(e){}
    state.gameChannel = null;
  }
  async function startGameRealtime(){
    if (!window.supabase || !state.supa) return; // supa client created in loadConfig
    await resolveGameIdIfNeeded();
    if (!state.gameId) return;
    await stopGameRealtime();
    const ch = state.supa.channel('game:'+state.gameId);
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: 'id=eq.' + state.gameId }, () => {
      // Always read from source of truth; do not merge client-side
      pollRoomStateOnce();
    });
    await ch.subscribe();
    state.gameChannel = ch;
    log && log('Realtime: subscribed to games row ' + state.gameId);
  }

  // ===== Answer Controls UI =====
  const AnswerUI = (function(){
    const micBtn = document.createElement('button');
    micBtn.id = 'ansMicBtn'; micBtn.className = 'btn'; micBtn.textContent = '🎤 Start';
    const kbBtn  = document.createElement('button');
    kbBtn.id = 'ansKbBtn'; kbBtn.className = 'btn'; kbBtn.textContent = '⌨️ Type';
    const doneBtn = document.createElement('button');
    doneBtn.id = 'ansDoneBtn'; doneBtn.className = 'btn'; doneBtn.textContent = 'Done';
    const submitBtn = document.createElement('button');
    submitBtn.id = 'ansSubmitBtn'; submitBtn.className='btn primary'; submitBtn.textContent = 'Submit answer';
    const box = document.createElement('textarea');
    box.id = 'ansBox'; box.placeholder = 'Your transcribed/typed answer...'; box.style.width='100%'; box.style.minHeight='90px';

    const container = document.createElement('div');
    container.id='answerControls'; container.className='card'; container.style.marginTop='8px';
    const title = document.createElement('div'); title.className='meta'; title.textContent='Your answer (turn-based)';
    const row = document.createElement('div'); row.className='row';
    row.appendChild(micBtn); row.appendChild(kbBtn); row.appendChild(doneBtn); row.appendChild(submitBtn);
    container.appendChild(title); container.appendChild(row); container.appendChild(box);

    function mount(where){
      if(!where) return;
      // Insert after question block if exists, else append
      where.appendChild(container);
    }
    return { mount, micBtn, kbBtn, doneBtn, submitBtn, box, container };
  })();

  // Mount into both panels (host and join)
  AnswerUI.mount(els.hostSection);
  AnswerUI.mount(els.joinSection);

  // ===== Speech recognition (Web Speech API) =====
  let recog = null, recognizing = false, transcriptBuf = '';
  function ensureRecognizer(){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR) return null;
    const r = new SR(); r.interimResults = true; r.lang = 'en-US';
    r.onresult = (e)=>{
      let s = '';
      for(let i=0;i<e.results.length;i++){ s += e.results[i][0].transcript + ' '; }
      transcriptBuf = s.trim();
      AnswerUI.box.value = transcriptBuf;
    };
    r.onend = ()=>{ recognizing = false; AnswerUI.micBtn.textContent='🎤 Start'; };
    return r;
  }
  AnswerUI.micBtn.onclick = ()=>{
    if(recognizing){ try{ recog && recog.stop(); }catch{}; recognizing=false; AnswerUI.micBtn.textContent='🎤 Start'; return; }
    recog = ensureRecognizer();
    if(!recog){ alert('Speech recognition not supported; use ⌨️ Type'); return; }
    transcriptBuf=''; AnswerUI.box.value='';
    recog.start(); recognizing = true; AnswerUI.micBtn.textContent='◼ Stop';
  };
  AnswerUI.kbBtn.onclick = ()=>{ AnswerUI.box.focus(); };
  AnswerUI.doneBtn.onclick = ()=>{ if(recognizing){ try{ recog && recog.stop(); }catch{}; recognizing=false; AnswerUI.micBtn.textContent='🎤 Start'; } };

  // ===== Turn engine (read-only from server) =====
  function isMyTurn(out){
    const turn = out?.current_turn;
    if (!turn) return false;
    const code = state.gameCode;
    let myPid = null; try { myPid = localStorage.getItem('ms_pid_'+code) || null; }catch{}
    // Host can answer when turn.role==='host' and this tab is host
    if (state.isHostInJoin && turn.role === 'host') return true;
    // Guests: match participant_id
    if (myPid && turn.participant_id === myPid) return true;
    return false;
  }

  // Gating UI on every state poll
  const _origPoll = pollRoomStateOnce;
  pollRoomStateOnce = async function(){
    await _origPoll();
    try{
      const r = await fetch(state.functionsBase + '/get_state?code=' + encodeURIComponent(state.gameCode||''));
      const out = await r.json().catch(()=>({}));
      const allow = isMyTurn(out) && out?.status==='running' && !out?.blocked_reason;
      AnswerUI.container.style.opacity = allow? '1' : '0.4';
      AnswerUI.micBtn.disabled = AnswerUI.kbBtn.disabled = AnswerUI.doneBtn.disabled = AnswerUI.submitBtn.disabled = !allow;
    }catch{}
  };

  // Submit answer
  AnswerUI.submitBtn.onclick = async ()=>{
    const text = (AnswerUI.box.value||'').trim();
    if (!text) return;
    const code = state.gameCode; if(!code) return;
    // We need game_id and question_id from the latest state
    const r = await fetch(state.functionsBase + '/get_state?code=' + encodeURIComponent(code));
    const out = await r.json().catch(()=>({}));
    const qid = out?.question?.id || null;
    const gid = out?.id || out?.game_id || state.gameId || null;
    if (!gid || !qid) return;
    const tempId = getTempPlayerId(code);

    const body = { game_id: gid, question_id: qid, text, temp_player_id: tempId };
    // also include participant_id if the server supports it (ignored otherwise)
    try{ const pid = localStorage.getItem('ms_pid_'+code); if(pid) body['participant_id'] = pid; }catch{}

    const rr = await fetch(state.functionsBase + '/submit_answer', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify(body) });
    const jout = await rr.json().catch(()=>({}));
    // Clear box on success
    if (rr.ok){ AnswerUI.box.value = ''; transcriptBuf=''; }
  };

})();
