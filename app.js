 (function(){

  // === UI build version ===
  const MS_UI_VERSION = 'v9';
  try {
    const h = document.getElementById('hostLog');
    if (h) { h.textContent = (h.textContent ? h.textContent + "\n" : "") + "UI version: " + MS_UI_VERSION; }
    const j = document.getElementById('joinLog');
    if (j) { j.textContent = (j.textContent ? j.textContent + "\n" : "") + "UI version: " + MS_UI_VERSION; }
  } catch (e) {}
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
    const beat=()=>{ if(!state.gameId) return;
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
    try{ if(out?.participant_id && typeof code!=='undefined'){ localStorage.setItem('ms_pid_'+code, out.participant_id); } }catch{}
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
      method:'POST', headers, body: JSON.stringify((()=>{ let pid=null; try{ pid=localStorage.getItem('ms_pid_'+code)||null;}catch{}; return pid? { code, participant_id: pid } : { code }; })())
    });
    const out = await r.json().catch(()=>({}));
    try{ if(out?.participant_id && typeof code!=='undefined'){ localStorage.setItem('ms_pid_'+code, out.participant_id); } }catch{}
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
    try{ if(out?.participant_id && typeof code!=='undefined'){ localStorage.setItem('ms_pid_'+code, out.participant_id); } }catch{}
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
    try{ if(out?.participant_id && typeof code!=='undefined'){ localStorage.setItem('ms_pid_'+code, out.participant_id); } }catch{}
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
    try{ if(out?.participant_id && typeof code!=='undefined'){ localStorage.setItem('ms_pid_'+code, out.participant_id); } }catch{}
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
    try{ if(out?.participant_id && typeof code!=='undefined'){ localStorage.setItem('ms_pid_'+code, out.participant_id); } }catch{}
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
      method:'POST', headers, body: JSON.stringify((()=>{ let pid=null; try{ pid=localStorage.getItem('ms_pid_'+code)||null;}catch{}; return pid? { code, name, participant_id: pid } : { code, name }; })())
    });
    const out = await r.json().catch(()=>({}));
    try{ if(out?.participant_id && typeof code!=='undefined'){ localStorage.setItem('ms_pid_'+code, out.participant_id); } }catch{}
    if (!r.ok){ if(els.joinLog) els.joinLog.textContent='Join failed: '+JSON.stringify(out); return; }

    const isHost = !!out?.is_host;
    state.isHostInJoin = isHost;
    state.gameCode = code;

    if (isHost){
      state.gameId = out.game_id || state.gameId;
      setText(els.gameIdOut, state.gameId || '—'); setText(els.gameCodeOut, code);
      startHeartbeat();
    } else if (name){
      setInterval(()=>{ fetch(state.functionsBase + '/participant_heartbeat',{ method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify((()=>{ let pid=null; try{ pid=localStorage.getItem('ms_pid_'+code)||null; }catch{}; return pid? { participant_id: pid } : { gameId: out?.game_id, name }; })()) }).catch(()=>{}); }, 25000);
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
    try{ if(out?.participant_id && typeof code!=='undefined'){ localStorage.setItem('ms_pid_'+code, out.participant_id); } }catch{}
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


  // Leave beacon to accelerate removal
  (function(){
    function sendLeave(){
      try{
        const code = (els.joinCode?.value||'').trim();
        const pid = (function(){ try{ return localStorage.getItem('ms_pid_'+code)||null; }catch{} return null; })();
        const name = (els.guestName?.value||'').trim();
        if(state && state.gameId){
          if(state.isHostInJoin){
            const body = pid? { gameId: state.gameId, participant_id: pid, leave: true } : { gameId: state.gameId, leave: true };
            navigator.sendBeacon((window.CONFIG?.FUNCTIONS_BASE||'') + '/heartbeat', JSON.stringify(body));
          }else{
            const body = pid? { participant_id: pid, leave: true } : { gameId: state.gameId, name, leave: true };
            navigator.sendBeacon((window.CONFIG?.FUNCTIONS_BASE||'') + '/participant_heartbeat', JSON.stringify(body));
          }
        }
      }catch{}
    }
    window.addEventListener('pagehide', sendLeave);
    window.addEventListener('beforeunload', sendLeave);
  })();

})();


  // ===== MS isolated turn/answer module (does not change existing handlers) =====
  ;(function MS_TurnsModule(){
    function stateProbe(){ try { return window.state || {}; } catch(e) { return {}; } }
    function elsProbe(){ try { return window.els || {}; } catch(e) { return {}; } }

    function mountCard(target, id){
      try{
        if (!target) return null;
        var ex = document.getElementById(id); if (ex) return ex;
        var card = document.createElement('div'); card.className='card'; card.id=id; card.style.marginTop='8px';
        card.innerHTML = [
          '<div class="meta">Your answer</div>',
          '<div class="row" style="gap:8px;margin:6px 0;">',
            '<button class="btn" data-ms="mic">🎤 Start</button>',
            '<button class="btn" data-ms="kb">⌨️ Type</button>',
            '<button class="btn" data-ms="done">Done</button>',
            '<button class="btn primary" data-ms="submit" style="display:none">Submit</button>',
          '</div>',
          '<textarea data-ms="box" placeholder="Your transcribed/typed answer..." style="width:100%;min-height:90px;display:none"></textarea>'
        ].join('');
        target.appendChild(card);
        return card;
      }catch(e){ return null; }
    }
    function qCardHost(){
      try{
        var els = elsProbe();
        var qt = els.questionText;
        return (qt && qt.closest && qt.closest('.card')) || els.host || document.body;
      }catch(e){ return null; }
    }
    function qCardGuest(){
      try{
        var els = elsProbe();
        var gq = els.gQuestionText;
        return (gq && gq.closest && gq.closest('.card')) || els.join || document.body;
      }catch(e){ return null; }
    }
    function wireCard(card){
      try{
        if (!card || card.__msWired) return; card.__msWired = true;
        var mic = card.querySelector('[data-ms="mic"]');
        var kb = card.querySelector('[data-ms="kb"]');
        var done = card.querySelector('[data-ms="done"]');
        var submit = card.querySelector('[data-ms="submit"]');
        var box = card.querySelector('[data-ms="box"]');
        var recog = null, on = false;
        function mkRecog(){
          try{
            var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if(!SR) return null;
            var r = new SR(); r.interimResults = true; r.lang = 'en-US';
            r.onresult = function(e){
              try{
                var s=''; for(var i=0;i<e.results.length;i++){ s+= e.results[i][0].transcript + ' '; }
                box.value = s.trim(); box.style.display='block'; submit.style.display='inline-block';
              }catch(err){}
            };
            r.onend = function(){ on=false; try{ mic.textContent='🎤 Start'; if((box.value||'').trim()){ box.style.display='block'; submit.style.display='inline-block'; } }catch(err){} };
            return r;
          }catch(err){ return null; }
        }
        if (mic) mic.addEventListener('click', function(){
          try{
            if(on){ try{ recog && recog.stop(); }catch(err){}; on=false; mic.textContent='🎤 Start'; return; }
            var r = mkRecog();
            if(!r){ box.style.display='block'; submit.style.display='inline-block'; box.focus(); return; }
            recog = r; box.value=''; try{ recog.start(); on=true; mic.textContent='◼ Stop'; }catch(err){}
          }catch(err){}
        });
        if (kb) kb.addEventListener('click', function(){ try{ box.style.display='block'; submit.style.display='inline-block'; box.focus(); }catch(err){} });
        if (done) done.addEventListener('click', function(){ try{ recog && recog.stop(); }catch(err){}; on=false; try{ mic.textContent='🎤 Start'; if((box.value||'').trim()){ box.style.display='block'; submit.style.display='inline-block'; } }catch(err){} });
        if (submit) submit.addEventListener('click', async function(){
          try{
            var st = stateProbe(); var els = elsProbe();
            var text=(box.value||'').trim(); if(!text) return;
            var code = st.gameCode || (els.joinCode&&els.joinCode.value||'').trim(); if(!code) return;
            var rs = await fetch(st.functionsBase + '/get_state?code='+encodeURIComponent(code));
            var out = await rs.json().catch(function(){ return {}; });
            var gid = out && (out.id || out.game_id || st.gameId); var qid = out && out.question && out.question.id; if(!gid||!qid) return;
            var k='ms_temp_'+code; var temp=localStorage.getItem(k); if(!temp){ temp=crypto.randomUUID(); localStorage.setItem(k,temp); }
            var pid = localStorage.getItem('ms_pid_'+code);
            var body = { game_id: gid, question_id: qid, text: text, temp_player_id: temp };
            if (pid) body['participant_id']=pid;
            await fetch(st.functionsBase + '/submit_answer', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
            box.value='';
          }catch(err){}
        });
        card.__msControls = { mic: mic, kb: kb, done: done, submit: submit, box: box };
      }catch(e){}
    }
    function setEnabled(card, allow){
      try{
        if (!card || !card.__msControls) return;
        var c = card.__msControls;
        [c.mic,c.kb,c.done,c.submit,c.box].forEach(function(el){ if (el) el.disabled = !allow; });
        card.style.opacity = allow? '1' : '0.5';
      }catch(e){}
    }

    function mountAll(){
      try{
        var hc = mountCard(qCardHost(), 'msAnsHost');
        var gc = mountCard(qCardGuest(), 'msAnsGuest');
        wireCard(hc); wireCard(gc);
      }catch(e){}
    }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', mountAll); } else { mountAll(); }

    async function tick(){
      try{
        var st = stateProbe(); var els = elsProbe();
        if (!st || !st.functionsBase) return;
        var code = st.gameCode || (els.joinCode&&els.joinCode.value||'').trim(); if(!code) return;
        var r = await fetch(st.functionsBase + '/get_state?code='+encodeURIComponent(code));
        var out = await r.json().catch(function(){ return {}; });

        // Only restrict Next AFTER a question exists and progress is available; never block first reveal.
        if (els.nextCardBtn && out && out.question && out.question.id && out.answers_progress){
          var ap = out.answers_progress;
          var gate = (out.status==='running') && ap && (ap.total_active>0) && (ap.answered_count<ap.total_active);
          if (gate) els.nextCardBtn.disabled = true;
        }

        // Bold current player only after a question exists; do not rewrite your list structure
        if (out && out.question && out.question.id && out.current_turn){
          var cur = out.current_turn.name;
          function boldList(ul){
            try{
              if(!ul) return;
              var lis = Array.prototype.slice.call(ul.querySelectorAll('li'));
              lis.forEach(function(li){ li.style.fontWeight='400'; });
              for (var i=0;i<lis.length;i++){
                var li = lis[i];
                var meta = li.querySelector('.meta'); var metaTxt = meta? meta.textContent : '';
                var base = meta? li.textContent.replace(metaTxt,'').trim() : li.textContent.trim();
                if (base === cur || base.indexOf(cur+' ')===0){ li.style.fontWeight='700'; break; }
              }
            }catch(err){}
          }
          boldList(els.hostPeople); boldList(els.guestPeople);
        }

        // Enable controls only for current turn player
        var pid = localStorage.getItem('ms_pid_'+code);
        var allowHost=false, allowGuest=false;
        if (out && out.status==='running' && out.current_turn){
          allowHost = (out.current_turn.role==='host' && !!stateProbe().isHostInJoin);
          allowGuest = !!( (pid && out.current_turn.participant_id===pid) || (!pid && els.guestName && out.current_turn.name===(els.guestName.value||'').trim()) );
        }
        setEnabled(document.getElementById('msAnsHost'), !!allowHost);
        setEnabled(document.getElementById('msAnsGuest'), !!allowGuest);
      }catch(e){}
    }
    setInterval(tick, 3000);
  })();

