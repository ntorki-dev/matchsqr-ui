 (function(){

  // === Non-conflicting UI version ===
  try{
    if (!window.__MS_UI_VERSION) {
      window.__MS_UI_VERSION = 'v48.9';
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
  const MS_UI_VERSION = 'v48.9';
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
  // ===== MS answer/turn helpers (v17) =====
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

          // Resolve ids from DOM stamp or cached ctx
          var sourceEl = card && card.getAttribute('data-gid') ? card : null;
          if (!sourceEl){
            try{
              if (els && els.questionText && els.questionText.getAttribute('data-gid')) sourceEl = els.questionText;
              else if (els && els.gQuestionText && els.gQuestionText.getAttribute('data-gid')) sourceEl = els.gQuestionText;
            }catch(_){}
          }
          var gid = sourceEl ? sourceEl.getAttribute('data-gid') : null;
          var qid = sourceEl ? sourceEl.getAttribute('data-qid') : null;
          if (!gid || !qid){
            var ctx = (window.__ms_ctx||{});
            gid = gid || ctx.gid || (window.state && (state.gameId||state.game_id)) || null;
            qid = qid || ctx.qid || null;
          }
          if (!gid || !qid){ try{ var lg=(document.getElementById('hostLog')||document.getElementById('joinLog')); if(lg){ lg.textContent += '\n[submit] missing ids (gid/qid)'; } }catch(_e){}; card.__submitting=false; try{ submit.disabled=false; }catch(_e){}; return; }

          // Resolve participant id (host turn only) or anonymous guest with name
          var pid = null;
          try{
            var turn = (window.__ms_ctx && window.__ms_ctx.turn) || null;
            var people = (window.__ms_ctx && window.__ms_ctx.participants) || [];
            if (turn && turn.role === 'host'){
              pid = turn.participant_id || null;
              if (!pid && Array.isArray(people)){
                for (var i=0;i<people.length;i++){ if (people[i].role==='host'){ pid = people[i].id; break; } }
              }
            } else {
              // no pid for anonymous guest
              pid = null;
            }
          }catch(_){}

          // Ensure temp id
          var k='ms_temp_'+String(gid); var temp=localStorage.getItem(k); if(!temp){ try{ temp=crypto.randomUUID(); }catch(_e){ temp=String(Date.now()); } localStorage.setItem(k,temp); }

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
          try{ var lg2=(document.getElementById('hostLog')||document.getElementById('joinLog')); if(lg2){ lg2.textContent += '\nsubmit_answer '+String(resp.status);
        if (resp && resp.ok) {
          try {
            card.querySelectorAll('button,textarea').forEach(function(el){ el.disabled=true; el.classList.add('opacity-60'); });
          } catch(_e){}
          try { if (typeof pollRoomStateOnce==='function') setTimeout(pollRoomStateOnce, 50); } catch(_e){}
        } else {
          try { console.warn('submit failed', resp && (await resp.text && await resp.text())); } catch(_e){}
        }
 } }catch(_){}
          if (resp.ok){ try{ box.value=''; }catch(_e){}; try{ if (typeof pollRoomStateOnce==='function') await pollRoomStateOnce(); }catch(_e){} }
          card.__submitting=false; try{ submit.disabled=false; }catch(_){}
        }catch(err){ try{ card.__submitting=false; submit.disabled=false; }catch(_){}
        }
      });

      card.__ms = { mic: mic, kb: kb, done: done, submit: submit, box: box };
    }catch(e){}
  }
  function MS_setEnabled(card, allow){
    try{
      if (!card || !card.__ms) return;
      var c = card.__ms;
      [c.mic,c.kb,c.done,c.submit,c.box].forEach(function(el){ if (el) el.disabled = !allow; });
      card.style.opacity = allow? '1' : '0.5';
    }catch(e){}
  }
  function MS_unmount(id){
    try{ var el = document.getElementById(id); if (el && el.parentNode) el.parentNode.removeChild(el); }catch(e){}
  }


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
  // Resolve and cache host display name from Supabase Auth profile
  async function refreshHostDisplayName(){
    try{
      if (!state.supa) return;
      const { data } = await state.supa.auth.getUser();
      const user = data && data.user;
      const meta = (user && user.user_metadata) || {};
      const email = user && user.email || '';
      state.hostDisplayName = meta.full_name || meta.name || meta.display_name || (email ? email.split('@')[0] : null) || 'Host';
    }catch(e){ /* ignore */ }
  }


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
      var nm = p.name || '';
      if (p.role === 'host' && state.hostDisplayName) nm = state.hostDisplayName;
      var pidAttr = (p && p.id) ? ` data-pid="${p.id}"` : '';
      return `<li${pidAttr}>${nm} <span class="meta">(${p.role})</span></li>`;
    }).join('') : '<li class="meta">No one yet</li>';
    els.hostPeople.innerHTML  = __listHTML;
    els.guestPeople.innerHTML = __listHTML;
    const count = Array.isArray(ppl) ? ppl.length : 0;
    if (els.hostPeopleCount) els.hostPeopleCount.textContent = String(count);
    if (els.guestPeopleCount) els.guestPeopleCount.textContent = String(count);
    // Min players gate for Start
    try{
      if (els.startGameBtn){
        if (out && out.status !== 'running'){
          els.startGameBtn.disabled = count < 2;
          els.startGameBtn.title = count < 2 ? 'At least 2 players required to start' : '';
        }
      }
    }catch(_){}
    // Max players gate on Join
    try{
      if (els.joinRoomBtn){
        if (count >= 8 && !state.isHostInJoin){
          els.joinRoomBtn.disabled = true;
          if (els.joinLog) els.joinLog.textContent = 'Room is full, maximum 8 players.';
        }else{
          els.joinRoomBtn.disabled = false;
        }
      }
    }catch(_){}

    // ===== MS v17: turn/answer UI (minimal, non-invasive) =====
    try{
      var hasQ = !!(out && out.question && out.question.id);
      // MS v48: baseline gating for Next button
      if (els.nextCardBtn && (!out || out.status!=='running')) { try{ els.nextCardBtn.disabled = true; }catch(e){} }
      // Allow first reveal only after game starts and only for host
      try{ if (els.nextCardBtn && out && out.status==='running' && !hasQ) { var _isHost = (out && out.me && out.me.role==='host') || MS_isHostView(); els.nextCardBtn.disabled = !_isHost; } }catch(_e){}


      // Gate Next only after a question exists and progress indicates pending answers
      if (els.nextCardBtn && hasQ && out && out.answers_progress){
      try{
        var ap = out && out.answers_progress;
        var me = out && out.me;
        var meRole = me ? me.role : null;
        var isHost = (meRole === 'host'); isHost = isHost || MS_isHostView();
        var doneRound = !!(ap && ap.total_active>0 && ap.answered_count>=ap.total_active);
        console.log('[apply] ta=%s ac=%s doneRound=%s', ap&&ap.total_active, ap&&ap.answered_count, doneRound);
        if (doneRound){
          if (els.nextCardBtn) els.nextCardBtn.disabled = !(isHost && state.status==='running');
                    var hostBox=document.getElementById('msAnsHost'); if(hostBox){ hostBox.querySelectorAll('button,textarea').forEach(function(el){ el.disabled=true; el.classList.add('opacity-60'); }); }
                    var guestBox=document.getElementById('msAnsGuest'); if(guestBox){ guestBox.querySelectorAll('button,textarea').forEach(function(el){ el.disabled=true; el.classList.add('opacity-60'); }); }
          try{
            var list = document.getElementById('participantsList');
            if (list) { list.querySelectorAll('[data-pid]').forEach(function(li){ li.style.fontWeight = 'normal'; }); }
          }catch(_e){}
          try{ if (window.__ms_ctx) window.__ms_ctx.turn = null; }catch(_e){}
        }
      }catch(_e){ console.warn('enforce doneRound failed', _e); }

        var ap = out.answers_progress;
        if (ap && (ap.total_active>0) && (ap.answered_count<ap.total_active)){
          els.nextCardBtn.disabled = true;
        }
      }

      if (hasQ){
        // Mount under the question cards
        var hc = MS_qHostCard(); var gc = MS_qGuestCard();
        var hostCard = MS_mountAnsCard(hc, 'msAnsHost');
        var guestCard = MS_mountAnsCard(gc, 'msAnsGuest');
        MS_wireAnsCard(hostCard); MS_wireAnsCard(guestCard);

        // Bold current player by participant_id
        if (out.current_turn){
          var curPid = out.current_turn.participant_id || null;
          try{
            function boldByPid(ul, pid){
              if (!ul || !pid) return;
              var items = ul.querySelectorAll('li[data-pid]');
              items.forEach(li => { li.style.fontWeight = '400'; });
              var el = ul.querySelector('li[data-pid="'+pid+'"]');
              if (el) el.style.fontWeight = '700';
            }
            boldByPid(els.hostPeople, curPid);
            boldByPid(els.guestPeople, curPid);
          }catch(_e){}
        }
        }

        // Enable controls only for current turn
        var isHost = MS_isHostView();
        var code = (window.state && (state.gameCode || (els.joinCode&&els.joinCode.value||'').trim())) || '';
        var pid = code ? localStorage.getItem('ms_pid_'+code) : null;
        // Inter-round lock to avoid re-enabling inputs between rounds
        var ap2 = out && out.answers_progress;
        var doneRound2 = !!(ap2 && ap2.total_active>0 && ap2.answered_count>=ap2.total_active);
        var allowHost=false, allowGuest=false;
        if (out.current_turn){
          allowHost = (out.current_turn.role==='host' && isHost);
          allowGuest = !!( (pid && out.current_turn.participant_id===pid) || (!pid && els.guestName && out.current_turn.name===(els.guestName.value||'').trim()) );
        } else {
          allowHost = isHost && !doneRound2; // Do not allow host while between rounds
        }
        if (doneRound2){ allowHost = false; allowGuest = false; }
        MS_setEnabled(document.getElementById('msAnsHost'), !!allowHost);
        MS_setEnabled(document.getElementById('msAnsGuest'), !!allowGuest);
      } else {
        MS_unmount('msAnsHost'); MS_unmount('msAnsGuest');
      }
    }catch(e){}

  }
  // === v28: delegated submit handler (surgical) ===
  (function(){
    if (window.__msDelegatedSubmit) return; window.__msDelegatedSubmit = true;
    function logLine(msg){
      try{ var lg = (document.getElementById('hostLog')||document.getElementById('joinLog')); if (lg){ lg.textContent += '\n'+msg; } }catch(_e){}
    }
    async function submitFromCard(card){
      try{
        if (!card || card.__submitting || card.__ms) return;
        var box = card.querySelector('[data-ms="box"]');
        var submit = card.querySelector('[data-ms="submit"]');
        if (!box || !submit) return;
        var text = (box.value||'').trim();
        if (!text){ logLine('[submit] blocked: empty text'); return; }
        card.__submitting = true; try{ submit.disabled = true; }catch(_){}

        
        // Resolve ids from stamped DOM or cached ctx
        var sourceEl = card && card.getAttribute('data-gid') ? card : null;
        if (!sourceEl){
          try{
            if (els && els.questionText && els.questionText.getAttribute('data-gid')) sourceEl = els.questionText;
            else if (els && els.gQuestionText && els.gQuestionText.getAttribute('data-gid')) sourceEl = els.gQuestionText;
          }catch(_){}
        }
        var gid = sourceEl ? sourceEl.getAttribute('data-gid') : null;
        var qid = sourceEl ? sourceEl.getAttribute('data-qid') : null;
        var out = { current_turn: (window.__ms_ctx && window.__ms_ctx.turn) || null, participants: (window.__ms_ctx && window.__ms_ctx.participants) || [] };
        if (!gid || !qid){ logLine('[submit] missing ids (gid/qid)'); card.__submitting=false; try{ submit.disabled=false; }catch(_e){}; return; }
    

        // Resolve participant_id
        var pid = null;
        if (out && out.current_turn && out.current_turn.role === 'host'){
          pid = out.current_turn.participant_id || null;
          if (!pid && out.participants && out.participants.length){
            for (var i=0;i<out.participants.length;i++){ if (out.participants[i].role==='host'){ pid = out.participants[i].id; break; } }
          }
        } else {
          pid = localStorage.getItem('ms_pid_'+code);
        }
        var k='ms_temp_'+code; var temp=localStorage.getItem(k); if(!temp){ try{ temp=crypto.randomUUID(); }catch(_e){ temp=String(Date.now()); } localStorage.setItem(k,temp); }
        var body = { game_id: gid, question_id: qid, text: text, temp_player_id: temp };
        if (pid) body.participant_id = pid;
        if (!pid){ // anonymous guest: include name
          try{
            var nm = (els.guestName && (els.guestName.value||'').trim()) || '';
            if (!nm && out && out.current_turn && out.current_turn.role==='guest') nm = out.current_turn.name || '';
            if (nm) body.name = nm;
          }catch(_e){}
        }
        logLine('[submit] sending ' + JSON.stringify({hasPid:!!pid, hasName: !!body.name, len: text.length}));
        var resp = await fetch(state.functionsBase + '/submit_answer', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
        var j = null; try{ j = await resp.clone().json(); }catch(_e){}
        logLine('submit_answer ' + String(resp.status) + ' ' + JSON.stringify(j||{}));

        if (resp.ok){
          try{ box.value=''; }catch(_){}
          try{ if (typeof pollRoomStateOnce === 'function') { await pollRoomStateOnce(); } }catch(_){}
        }
        card.__submitting=false; try{ submit.disabled=false; }catch(_){}
      } catch(e){
        logLine('[submit] error ' + String(e));
        try{ card.__submitting=false; var submit = card.querySelector('[data-ms=\"submit\"]'); if(submit) submit.disabled=false; }catch(_){}
      }
    }
    document.addEventListener('click', function(ev){
      try{
        var t = ev.target;
        if (!t) return;
        if (t.matches && t.matches('[data-ms=\"submit\"]')){ submitFromCard(t.closest('.card')); return; }
        if (t.closest){ var btn = t.closest('[data-ms=\"submit\"]'); if (btn){ submitFromCard(btn.closest('.card')); return; } }
      }catch(_e){}
    }, true);
  })();

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
    state.session = data.session; log('Login ok'); try{ refreshHostDisplayName(); }catch(_){}
  });

  // Auto-join as host helper
  async function autoJoinAsHost(code){
    if(!code){ log('No code to join.'); return; }
    hide(els.home); hide(els.host); show(els.join);
    if (els.joinCode) els.joinCode.value = code;

    const headers = { 'content-type':'application/json' };
    if (state.session?.access_token) headers['authorization'] = 'Bearer ' + state.session.access_token;

    const r = await fetch(state.functionsBase + '/join_game_guest', {
      method:'POST', headers, body: JSON.stringify((()=>{
        let pid=null; try{ pid=localStorage.getItem('ms_pid_'+code)||null;}catch{};
        const payload = pid ? { code, participant_id: pid } : { code };
        if (state.hostDisplayName) payload.name = state.hostDisplayName;
        return payload;
      })())
    });
    const out = await r.json().catch(()=>({}));
    try{ if(out?.participant_id && typeof code!=='undefined'){ localStorage.setItem('ms_pid_'+code, out.participant_id); } }catch{}
    if (!r.ok){ if(els.joinLog) els.joinLog.textContent='Join failed: '+JSON.stringify(out); return; }

    const isHost = !!out?.is_host;
    if (!isHost){ if(els.joinLog) els.joinLog.textContent='This code belongs to an existing room, but you are not the host.'; return; }

    state.isHostInJoin = true; try{ refreshHostDisplayName(); }catch(_){}
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
    try{
    const { data, error } = await state.supa.functions.invoke('create_game', {
      body: { name: state.hostDisplayName || null }
    });
    if (error){
      if (error.message === 'host_has_active_game' && data && data.code){
        log('Active game exists; auto-joining as host with code ' + data.code);
        await autoJoinAsHost(data.code);
        return;
      }
      log('Create failed'); log(error); return;
    }
    const out = data || {};
    try{ if(out?.participant_id && typeof code!=='undefined'){ localStorage.setItem('ms_pid_'+code, out.participant_id); } }catch{}
    log('Create ok'); applyHostGame(out); startHeartbeat();
  }catch(e){
    log('Create failed'); log(String(e));
  }
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
    state.isHostInJoin = isHost; if (isHost) { try{ refreshHostDisplayName(); }catch(_){}}
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
