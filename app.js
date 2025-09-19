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


  // === Answer helpers (non-invasive) ===
  function getTempPlayerId(code){
    try{
      const k='ms_temp_'+code;
      let v=localStorage.getItem(k);
      if(!v){ v=crypto.randomUUID(); localStorage.setItem(k,v); }
      return v;
    }catch{ return null; }
  }
  function getParticipantId(code){
    try{ return localStorage.getItem('ms_pid_'+code) || null; }catch{ return null; }
  }

  // State
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

    // === Turn & progress based UI updates (non-invasive) ===
    try{
      const currentPid = out?.current_turn?.participant_id || null;
      // Bold current player
      if (Array.isArray(ppl)){
        const pHtml = ppl.map(p=>{
          const nameHtml = (currentPid && p.id===currentPid) ? `<strong>${p.name}</strong>` : p.name;
          const seat = (p.seat_index!=null? (' · #'+p.seat_index) : '');
          return `<li>${nameHtml} <span class="meta">${p.role}${seat}</span></li>`;
        }).join('') || '<li class="meta">No one yet</li>';
        if (els.hostPeople) els.hostPeople.innerHTML = pHtml;
        if (els.guestPeople) els.guestPeople.innerHTML = pHtml;
      }
      // Host Next Card gating
      if (els.nextCardBtn){
        const ap = out?.answers_progress;
        const canNext = (out?.status==='running') && ap && (ap.total_active>0) && (ap.answered_count>=ap.total_active);
        els.nextCardBtn.disabled = !canNext;
      }
      // Enable/disable answer controls by turn
      if (state.__answerUI){
        const code = state.gameCode || (els.joinCode?.value||'').trim();
        const myPid = getParticipantId(code);
        const myName = (els.guestName?.value||'').trim();
        let allow = false;
        if (out?.status==='running' && out?.current_turn){
          if (out.current_turn.role==='host' && state.isHostInJoin){ allow = true; }
          else if (myPid && out.current_turn.participant_id===myPid){ allow = true; }
          else if (!myPid && myName){
            const me = (out.participants||[]).find(p => p.name===myName);
            if (me && me.id===out.current_turn.participant_id) allow = true;
          }
        }
        const uiSet = [state.__answerUI.hostUI, state.__answerUI.guestUI];
        uiSet.forEach(UI => {
          if (!UI) return;
          [UI.mic, UI.kb, UI.done, UI.submit, UI.box].forEach(el => { if (el) el.disabled = !allow; });
          if (UI.box) UI.box.style.opacity = allow? '1' : '0.5';
        });
      }
    }catch{}

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

  // === Answer Controls UI (mic + keyboard) ===
  (function initAnswerControls(){
    if (!els.host || !els.join) return;
    const card = document.createElement('div'); card.id='answerControls'; card.className='card'; card.style.marginTop='8px';
    card.innerHTML = [
      '<div class="meta">Your answer</div>',
      '<div class="row" style="gap:8px;margin:6px 0;">',
        '<button id="ansMicBtn" class="btn">🎤 Start</button>',
        '<button id="ansKbBtn" class="btn">⌨️ Type</button>',
        '<button id="ansDoneBtn" class="btn">Done</button>',
        '<button id="ansSubmitBtn" class="btn primary" style="display:none">Submit answer</button>',
      '</div>',
      '<textarea id="ansBox" placeholder="Your transcribed/typed answer..." style="width:100%;min-height:90px;display:none"></textarea>'
    ].join('');
    // Mount under question area for both host & join
    try{ els.host.appendChild(card.cloneNode(true)); }catch{}
    try{ els.join.appendChild(card); }catch{}

    function byId(root,id){ return (root && root.querySelector('#'+id)) || null; }
    const hostRoot = els.host; const joinRoot = els.join;
    const hostUI = {
      mic: byId(hostRoot,'ansMicBtn'), kb: byId(hostRoot,'ansKbBtn'), done: byId(hostRoot,'ansDoneBtn'),
      submit: byId(hostRoot,'ansSubmitBtn'), box: byId(hostRoot,'ansBox')
    };
    const guestUI = {
      mic: byId(joinRoot,'ansMicBtn'), kb: byId(joinRoot,'ansKbBtn'), done: byId(joinRoot,'ansDoneBtn'),
      submit: byId(joinRoot,'ansSubmitBtn'), box: byId(joinRoot,'ansBox')
    };

    // Speech recognition shared helpers
    let recogHost=null, recogGuest=null, recogOnHost=false, recogOnGuest=false;
    function makeRecog(){
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if(!SR) return null;
      const r = new SR(); r.interimResults = true; r.lang = 'en-US';
      return r;
    }
    function wire(root, ui, isHost){
      if(!ui || !ui.mic || !ui.kb || !ui.done || !ui.submit || !ui.box) return;
      let recog = null; let on = false;
      ui.mic.onclick = ()=>{
        if(on){ try{ recog && recog.stop(); }catch{}; on=false; ui.mic.textContent='🎤 Start'; return; }
        recog = makeRecog();
        if(!recog){ alert('Speech recognition not supported; use ⌨️ Type'); return; }
        ui.box.value='';
        recog.onresult = (e)=>{ ui.box.style.display='block'; ui.submit.style.display='inline-block';
          let s=''; for(let i=0;i<e.results.length;i++){ s += e.results[i][0].transcript + ' '; } ui.box.value=s.trim();
        };
        recog.onend = ()=>{ on=false; ui.mic.textContent='🎤 Start'; };
        try{ recog.start(); on=true; ui.mic.textContent='◼ Stop'; }catch{}
      };
      ui.kb.onclick = ()=>{ ui.box.style.display='block'; ui.submit.style.display='inline-block'; ui.box.focus(); };
      ui.done.onclick = ()=>{ try{ recog && recog.stop(); }catch{}; on=false; ui.mic.textContent='🎤 Start'; if((ui.box.value||'').trim()){ ui.box.style.display='block'; ui.submit.style.display='inline-block'; } };
      ui.submit.onclick = async ()=>{
        const text = (ui.box.value||'').trim(); if(!text) return;
        const code = state.gameCode || (els.joinCode?.value||'').trim(); if(!code) return;
        // Ensure we have gameId + question from state API
        try{
          const rs = await fetch(state.functionsBase + '/get_state?code='+encodeURIComponent(code));
          const st = await rs.json().catch(()=>({}));
          const gid = st?.id || st?.game_id || state.gameId; const qid = st?.question?.id || null;
          if (!gid || !qid) return;
          const body = { game_id: gid, question_id: qid, text, temp_player_id: getTempPlayerId(code) };
          // send participant_id if available (backend can ignore safely)
          const pid = getParticipantId(code); if(pid) body['participant_id']=pid;
          await fetch(state.functionsBase + '/submit_answer', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify(body) });
          ui.box.value='';
        }catch{}
      };
    }
    wire(hostRoot, hostUI, true);
    wire(joinRoot, guestUI, false);

    // Expose enabling/disabling by turn from the polling loop
    state.__answerUI = { hostUI, guestUI };
  })();

})();
