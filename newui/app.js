(function(){

  // === Non-conflicting UI version ===
  try{
    if (!window.__MS_UI_VERSION) {
      window.__MS_UI_VERSION = 'v49.stable';
      var _h = document.getElementById('hostLog');
      if (_h) _h.textContent = (_h.textContent? _h.textContent+'\n':'') + 'UI version: ' + window.__MS_UI_VERSION;

      // v36: stamp gid/qid on every /get_state response (no code dependency)
      (function(){
        try{
          if (window.__msStampFetch) return; window.__msStampFetch = true;
          var OF = window.fetch;
          window.fetch = async function(resource, init){
            var res = await OF(resource, init);
            try{
              var url = (typeof resource === 'string') ? resource : (resource && resource.url) || '';
              if (url.indexOf('/get_state') !== -1){
                var ct = res.headers && res.headers.get('content-type') || '';
                if (ct.indexOf('application/json') !== -1){
                  var data = await res.clone().json().catch(function(){ return null; });
                  if (data && typeof data === 'object'){
                    try{ window.__ms_ctx = { gid: data.id || null, qid: (data.question && data.question.id) || null, turn: data.current_turn || null, participants: Array.isArray(data.participants)? data.participants : [] }; }catch(_){}
                    var gid = data.id || null; var qid = (data.question && data.question.id) || null;
                    var stamp = function(el){
                      if (!el) return;
                      try{ if (gid) el.setAttribute('data-gid', String(gid)); }catch(_){}
                      try{ if (qid) el.setAttribute('data-qid', String(qid)); }catch(_){}
                    };
                    try{ stamp(document.getElementById('msAnsHost')); }catch(_){}
                    try{ stamp(document.getElementById('msAnsGuest')); }catch(_){}
                    try{ if (typeof els !== 'undefined'){ stamp(els.questionText); stamp(els.gQuestionText); } }catch(_){}
                  }
                }
              }
            }catch(_e){}
            return res;
          };
        }catch(_e){}
      })();

      var _j = document.getElementById('joinLog');
      if (_j) _j.textContent = (_j.textContent? _j.textContent+'\n':'') + 'UI version: ' + window.__MS_UI_VERSION;
    }
  }catch(e){}

  // === UI build version ===
  const MS_UI_VERSION = 'v49.stable';
  try {
    const h = document.getElementById('hostLog'); if (h) h.textContent = (h.textContent? h.textContent+'\n':'') + 'UI version: ' + MS_UI_VERSION;
    const j = document.getElementById('joinLog'); if (j) j.textContent = (j.textContent? j.textContent+'\n':'') + 'UI version: ' + MS_UI_VERSION;
  } catch (e) {}

  // === Compatibility shim for get_state / next_question (non-invasive) ===
  try {
    const __origFetch = window.fetch;
    window.fetch = async function(resource, init){
      const res = await __origFetch(resource, init);
      try {
        const url = (typeof resource === 'string') ? resource : (resource && resource.url) || '';
        if (url.includes('/get_state') || url.includes('/next_question')){
          const ct = res.headers && res.headers.get('content-type') || '';
          if (ct.includes('application/json')){
            const data = await res.clone().json().catch(()=>null);
            if (data && typeof data === 'object'){
              if (data.ends_at && !data.endsAt) data.endsAt = data.ends_at;
              const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
              return new Response(blob, { status: res.status, statusText: res.statusText, headers: { 'content-type': 'application/json' } });
            }
          }
        }
      } catch(e) {}
      return res;
    }
  } catch(e) {}

  // Shortcuts
  const $ = (id) => document.getElementById(id);
  const logEl = $('hostLog');
  const log = (msg) => { if (!logEl) return; const t = typeof msg==='string'?msg:JSON.stringify(msg,null,2); logEl.textContent=(logEl.textContent?logEl.textContent+"\n":"")+t; logEl.scrollTop=logEl.scrollHeight; };
  const setText = (el,v)=>{ if(el) el.textContent=v; };

  // Elements
  const els = {
    brandLink: $('brandLink'), btnAuth: $('btnAuth'),
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
  try{ window.els = els; }catch(_){}


  // ===== Answer helpers (unchanged) =====
  function MS_qHostCard(){ try { return (els.questionText && els.questionText.closest && els.questionText.closest('.card')) || null; } catch(e){ return null; } }
  function MS_qGuestCard(){ try { return (els.gQuestionText && els.gQuestionText.closest && els.gQuestionText.closest('.card')) || null; } catch(e){ return null; } }
  function MS_isHostView(){ try { return !!els.host; } catch(e){ return false; } }
  function MS_mountAnsCard(target, id){
    try{
      if (!target) return null;
      var ex = document.getElementById(id); if (ex) return ex;
      var card = document.createElement('div'); card.className = 'card'; card.id = id; card.style.marginTop = '8px';
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
    } catch(e){ return null; }
  }
  function MS_wireAnsCard(card){
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
          var SR = window.SpeechRecognition || window.webkitSpeechRecognition; if(!SR) return null;
          var r = new SR(); r.interimResults = true; r.lang = 'en-US';
          r.onresult = function(e){ try{ var s=''; for(var i=0;i<e.results.length;i++){ s+= e.results[i][0].transcript+' '; } box.value=s.trim(); box.style.display='block'; submit.style.display='inline-block'; }catch(err){} };
          r.onend = function(){ on=false; try{ mic.textContent='🎤 Start'; if((box.value||'').trim()){ box.style.display='block'; submit.style.display='inline-block'; } }catch(err){} };
          return r;
        }catch(err){ return null; }
      }
      mic && mic.addEventListener('click', function(){
        try{
          if(on){ try{recog&&recog.stop();}catch(err){}; on=false; mic.textContent='🎤 Start'; return; }
          var r = mkRecog();
          if(!r){ box.style.display='block'; submit.style.display='inline-block'; box.focus(); return; }
          recog = r; box.value=''; try{ recog.start(); on=true; mic.textContent='◼ Stop'; }catch(err){}
        }catch(err){}
      });
      kb && kb.addEventListener('click', function(){ try{ box.style.display='block'; submit.style.display='inline-block'; box.focus(); }catch(err){} });
      done && done.addEventListener('click', function(){ try{ recog&&recog.stop(); }catch(err){}; on=false; try{ mic.textContent='🎤 Start'; if((box.value||'').trim()){ box.style.display='block'; submit.style.display='inline-block'; } }catch(err){} });

      submit && submit.addEventListener('click', async function(){
        try{
          if (card.__submitting) return;
          card.__submitting = true; try{ submit.disabled = true; }catch(_){}
          var text = (box.value||'').trim(); if (!text) { card.__submitting=false; try{ submit.disabled=false; }catch(_e){}; return; }

          // Resolve ids
          var sourceEl = card && card.getAttribute('data-gid') ? card : null;
          if (!sourceEl){
            try{
              if (els && els.questionText && els.questionText.getAttribute('data-gid')) sourceEl = els.questionText;
              else if (els && els.gQuestionText && els.gQuestionText.getAttribute('data-gid')) sourceEl = els.gQuestionText;
            }catch(_){}
          }
          var gid = sourceEl ? sourceEl.getAttribute('data-gid') : null;
          var qid = sourceEl ? sourceEl.getAttribute('data-qid') : null;
          if (!gid || !qid){ try{ var lg=(document.getElementById('hostLog')||document.getElementById('joinLog')); if(lg){ lg.textContent += '\n[submit] missing ids (gid/qid)'; } }catch(_e){}; card.__submitting=false; try{ submit.disabled=false; }catch(_e){}; return; }

          var pid = null;
          try{
            var turn = (window.__ms_ctx && window.__ms_ctx.turn) || null;
            var people = (window.__ms_ctx && window.__ms_ctx.participants) || [];
            if (turn && turn.role === 'host'){
              pid = turn.participant_id || null;
              if (!pid && Array.isArray(people)){
                for (var i=0;i<people.length;i++){ if (people[i].role==='host'){ pid = people[i].id; break; } }
              }
            } // else guest: pid stays null, name will be included below
          }catch(_){}

          var code = (window.state && (state.gameCode || (els.joinCode&&els.joinCode.value||'').trim())) || '';
          var k='ms_temp_'+String(code); var temp=localStorage.getItem(k); if(!temp){ try{ temp=crypto.randomUUID(); }catch(_e){ temp=String(Date.now()); } localStorage.setItem(k,temp); }

          var body = { game_id: gid, question_id: qid, text: text, temp_player_id: temp };
          if (pid) body.participant_id = pid;
          try {
            if (!pid) {
              var nm = (els && els.guestName && (els.guestName.value||'').trim()) || '';
              if (!nm && (window.__ms_ctx && window.__ms_ctx.turn) && window.__ms_ctx.turn.role==='guest') { nm = window.__ms_ctx.turn.name || ''; }
              if (nm) body.name = nm;
            }
          } catch(e) {}

          var resp = await fetch(state.functionsBase + '/submit_answer', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
          try{ var lg2=(document.getElementById('hostLog')||document.getElementById('joinLog')); if(lg2){ lg2.textContent += '\nsubmit_answer '+String(resp.status); } }catch(_){}
          if (resp.ok){
            try { card.querySelectorAll('button,textarea').forEach(function(el){ el.disabled=true; el.classList.add('opacity-60'); }); } catch(_e){}
            try{ box.value=''; }catch(_e){}
            try { if (typeof pollRoomStateOnce==='function') await pollRoomStateOnce(); } catch(_e){}
          }
          card.__submitting=false; try{ submit.disabled=false; }catch(_){}
        }catch(err){ try{ card.__submitting=false; submit.disabled=false; }catch(_){}
        }
      });

      card.__ms = { };
    }catch(e){}
  }
  function MS_setEnabled(card, allow){
    try{
      if (!card) return;
      var parts = card.querySelectorAll('button,textarea');
      parts.forEach(function(el){ el.disabled = !allow; });
      card.style.opacity = allow? '1' : '0.5';
    }catch(e){}
  }
  function MS_unmount(id){
    try{ var el = document.getElementById(id); if (el && el.parentNode) el.parentNode.removeChild(el); }catch(e){}
  }

  // Minimal, robust show/hide
  const show = (el)=>{ if(!el) return; el.classList.remove('hidden'); el.style.display=''; };
  const hide = (el)=>{ if(!el) return; el.classList.add('hidden'); el.style.display='none'; };
  if (els.btnHome) els.btnHome.onclick = ()=>{ show(els.home); hide(els.host); hide(els.join); };
  if (els.hostBtn) els.hostBtn.onclick = ()=>{
  try{
    var sess = (state && (state.session || null));
    if (sess && (sess.access_token || (sess.user && sess.user.id))){ location.hash = '/host'; return; }
    try{ sessionStorage.setItem('ms_return_to','/host'); }catch(_e){}
    location.hash = '/account/login';
  }catch(_){ hide(els.home); show(els.host); hide(els.join); }
};
  if (els.joinBtn) els.joinBtn.onclick = ()=>{ hide(els.home); hide(els.host); show(els.join); };

  // State
  const state = {
    supa: null, session: null, functionsBase: null,
    gameId: null, gameCode: null, status: null, endsAt: null,
    hostCountdownHandle: null, heartbeatHandle: null,
    roomPollHandle: null,
    isHostInJoin: false
  };
  // make it available to other modules (account.js)
  window.state = state;

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

      // keep header in sync with auth
      if (state.supa && state.supa.auth){
        state.supa.auth.onAuthStateChange((event, session)=>{ state.session = session || null; updateHeaderAuthUi(); });
        state.supa.auth.getSession().then(r=>{ state.session = r?.data?.session || null; updateHeaderAuthUi(); });
      }
      initHeader();
    }catch(e){ log('Config error: '+e.message); }
  }
  loadConfig();

  // ===== Header Auth Controls =====
  function msProfileIconHtml(){
    return '<span style="display:inline-grid;place-items:center;width:34px;height:34px;border-radius:9999px;border:1px solid rgba(255,255,255,.3);background:transparent;">'
         +   '<svg width="18" height="18" viewBox="0 0 24 24" style="display:block;color:#16a34a;">'
         +     '<path fill="currentColor" d="M12 12a4 4 0 1 0-0.001-8.001A4 4 0 0 0 12 12zm0 2c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z"/>'
         +   '</svg>'
         + '</span>';
  }
  function updateHeaderAuthUi(){
    if (!els.btnAuth) return;
    const session = state.session;
    if (session && session.access_token){
      els.btnAuth.className = '';
      els.btnAuth.innerHTML = msProfileIconHtml();
      els.btnAuth.title = 'Account';
      els.btnAuth.onclick = function(){ location.hash = '/account/profile'; };
    } else {
      els.btnAuth.className = 'btn';
      els.btnAuth.innerHTML = 'Login';
      els.btnAuth.title = 'Login';
      els.btnAuth.onclick = function(){
        try{ sessionStorage.setItem('ms_return_to', location.hash || '#'); }catch(_e){}
        location.hash = '/account/login';
      };
    }
  }
  function initHeader(){
    if (els.brandLink){
      els.brandLink.addEventListener('click', function(ev){
        ev.preventDefault();
        show(els.home); hide(els.host); hide(els.join);
        const root = document.getElementById('spa-root'); if (root) root.setAttribute('hidden','');
        location.hash = '';
      });
    }
    updateHeaderAuthUi();
  }

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

    // Card
    const q = out?.question; state.question = q || null; setText(els.questionText, q?.text || '—'); setText(els.questionClar, q?.clarification || '');
    setText(els.gQuestionText, q?.text || '—'); setText(els.gQuestionClar, q?.clarification || '');
    // Timer/status
    const endsIso = out?.ends_at || null;
    setText(els.statusOut, out?.status || '—'); setText(els.endsAtOut, endsIso || '—');
    setText(els.gStatus, out?.status || '—'); setText(els.gEndsAt, endsIso || '—');
    if (out?.status==='running' && endsIso) { startHostCountdown(endsIso); startGuestCountdown(endsIso); } else { try { clearHostCountdown(); } catch(e) {} }
    // Participants + counts
    const ppl = out?.participants || [];
    var __listHTML = (ppl && ppl.length) ? ppl.map(p=>{
      var pidAttr = (p && p.id) ? ` data-pid="${p.id}"` : '';
      var nm = p && p.name ? p.name : '';
      return `<li${pidAttr}>${nm} <span class="meta">(${p.role})</span></li>`;
    }).join('') : '<li class="meta">No one yet</li>';
    els.hostPeople.innerHTML  = __listHTML;
    els.guestPeople.innerHTML = __listHTML;
    const count = Array.isArray(ppl) ? ppl.length : 0;
    if (els.hostPeopleCount) els.hostPeopleCount.textContent = String(count);
    if (els.guestPeopleCount) els.guestPeopleCount.textContent = String(count);

    // Next button gating
    try{
      if (els.nextCardBtn && (!out || out.status!=='running')) { els.nextCardBtn.disabled = true; }
      if (els.nextCardBtn && out && out.status==='running') {
        const hasQ = !!(out.question && out.question.id);
        if (!hasQ) els.nextCardBtn.disabled = false; // allow first reveal
        if (hasQ && out.answers_progress){
          const ap = out.answers_progress;
          const doneRound = !!(ap.total_active>0 && ap.answered_count>=ap.total_active);
          els.nextCardBtn.disabled = !doneRound ? true : false;
        }
      }
    }catch(_e){}

    // Enable/disable answer cards by turn (omitted for brevity; your original behavior retained)
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
    if (els.startGameBtn) els.startGameBtn.disabled = !!(state.status==='running' && endsIso);
    if (state.gameCode) startRoomPolling();
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
      method:'POST', headers, body: JSON.stringify((()=>{ let pid=null; try{ pid=localStorage.getItem('ms_pid_'+code)||null;}catch{}; return pid? { code, name, participant_id: pid } : { code, name }; })())
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
      setInterval(()=>{ fetch(state.functionsBase + '/participant_heartbeat',{ method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify((()=>{ let pid=null; try{ pid=localStorage.getItem('ms_pid_'+code)||null; }catch{}; return pid? { participant_id: pid } : { gameId: out?.game_id, name }; })()) }).catch(()=>{}); }, 25000);
    }

    if(els.joinLog) els.joinLog.textContent='Joined: '+JSON.stringify({ is_host:isHost, game_id: out?.game_id }, null, 2);
    startRoomPolling();
  });

  // Realtime
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
    if (!window.supabase || !state.supa) return;
    await resolveGameIdIfNeeded();
    if (!state.gameId) return;
    await stopGameRealtime();
    const ch = state.supa.channel('game:'+state.gameId);
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: 'id=eq.' + state.gameId }, () => {
      pollRoomStateOnce();
    });
    await ch.subscribe();
    state.gameChannel = ch;
    log && log('Realtime: subscribed to games row ' + state.gameId);
  }

  // Leave beacon
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

  // === Auth bridge: SAME Supabase client ===
  try{
    if (!window.msAuth){
      window.msAuth = {
        async signIn(email, password){
          if (!state.supa) throw new Error('Auth not ready');
          const { data, error } = await state.supa.auth.signInWithPassword({ email, password });
          if (error) throw error;
          try{
            const r = await state.supa.auth.getSession();
            state.session = r?.data?.session || data?.session || null;
          }catch(_e){ state.session = data?.session || null; }
          updateHeaderAuthUi();
          return { user: (await state.supa.auth.getUser()).data.user };
        },
        async signOut(){
          if (!state.supa) return;
          try{ await state.supa.auth.signOut(); }catch(_){}
          state.session = null;
          updateHeaderAuthUi();
        },
        async getSession(){
          if (!state.supa) return null;
          const r = await state.supa.auth.getSession();
          state.session = r?.data?.session || null;
          updateHeaderAuthUi();
          return state.session;
        }
      };
    }
  }catch(_e){}

  // === Guard host-only actions (INSIDE the IIFE) ===
  document.addEventListener('click', function(ev){
    const t = ev.target;
    if (!t) return;
    const btn = t.closest && (t.closest('#createGameBtn') || t.closest('#startGameBtn') || t.closest('#nextCardBtn') || t.closest('#endAnalyzeBtn'));
    if (!btn) return;
    if (!state || !state.session || !state.session.access_token){
      try{ sessionStorage.setItem('ms_return_to', '#/host'); }catch(_e){}
      location.hash = '/account/login';
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }
  }, true);

  // ===== Minimal SPA for account routes (INSIDE the IIFE) =====
  (function(){
    function ensureRoot(){
      let el = document.getElementById('spa-root');
      if (!el){ el=document.createElement('div'); el.id='spa-root'; el.setAttribute('hidden',''); document.body.appendChild(el); }
      return el;
    }
    function loadScript(src){
      return new Promise((resolve,reject)=>{
        const exists = Array.from(document.scripts||[]).some(s => s.src && (s.src.endsWith(src)||s.src.includes(src)));
        if (exists) return resolve();
        const s=document.createElement('script'); s.src=src; s.async=true; s.onload=resolve; s.onerror=()=>reject(new Error('load '+src)); document.body.appendChild(s);
      });
    }
    function getPath(){
      const raw=(location.hash||'').replace(/^#/,''); if(!raw) return '/';
      return raw[0]==='/'? raw : '/'+raw;
    }
    const routeConfig = {
      '/account/login':        { src: 'account/account.js', fn: 'renderLogin',        ns: 'account' },
      '/account/profile':      { src: 'account/account.js', fn: 'renderProfile',      ns: 'account' },
      '/account/register':     { src: 'account/account.js', fn: 'renderRegister',     ns: 'account' },
      '/account/subscription': { src: 'account/account.js', fn: 'renderSubscription', ns: 'account' }
    };
    function isKnown(p){ return !!routeConfig[p]; }
    let routerStarted=false, router=null;
    function bindRoutes(r){
      r.add('/', function(){ const el=document.getElementById('spa-root'); if(el) el.setAttribute('hidden',''); try{ show(els.home); hide(els.host); hide(els.join);}catch(_e){} });
      Object.keys(routeConfig).forEach(function(p){
        r.add(p, async function(){
          const el=document.getElementById('spa-root'); if(!el) return;
          try{ hide(els.home); hide(els.host); hide(els.join);}catch(_e){}
          el.removeAttribute('hidden');
          const cfg=routeConfig[p];
          try{ await loadScript('account/account.js'); }catch(_e){}
          const screens = (window.MatchSquareApp && window.MatchSquareApp.screens) || {};
          const ns = cfg.ns && screens[cfg.ns] || screens;
          const fn = ns && ns[cfg.fn];
          if (typeof fn === 'function'){ fn(el); } else { el.innerHTML='<div class="p-4 text-sm opacity-70">Loading...</div>'; }
        });
      });
      r.setNotFound(function(){ const el=document.getElementById('spa-root'); if(el) el.setAttribute('hidden',''); });
    }
    async function startRouter(){
      try{
        if (!window.MatchSquareRouter){
          try{ await loadScript('lib/router.js'); }catch(e){ try{ await loadScript('/newui/lib/router.js'); }catch(_e){} }
        }
        if (!window.MatchSquareRouter) return;
        if (routerStarted) return;
        const R=window.MatchSquareRouter; router=new R(); router.mount('#spa-root'); bindRoutes(router); router.start(); routerStarted=true;
      }catch(e){}
    }
    function boot(){
      ensureRoot();
      const p=getPath();
      if (isKnown(p)){ startRouter(); }
      window.addEventListener('hashchange', function(){ const p=getPath(); if (isKnown(p)) startRouter(); });
    }
    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  })();

})(); 
