// game.js
import { API, msPidKey, resolveGameId, getRole, setRole, draftKey, hostMarkerKey, inferAndPersistHostRole, getSession } from './api.js';
import { renderHeader, ensureDebugTray, $, toast, setHeaderActions, clearHeaderActions } from './ui.js';
import * as Summary from './summary.js';
import { initClarificationOverlay, setHostElement, setClarification, syncClarificationButton } from './clarification-overlay.js';

const Game = {
  
  // --- Speech-to-Text controls (browser-based, Web Speech API) ---
  startSTT(){
    try{ if (this._rec) { this.stopSTT(); } }catch{}
    try{
      const isLocal = typeof location!=='undefined' && /^(localhost|127\.0\.0\.1)$/i.test(location.hostname||'');
      const isSecure = typeof location!=='undefined' && location.protocol==='https:';
      if (!isLocal && !isSecure){ try{ toast('Speech to text may require HTTPS'); }catch{} }
    }catch{}
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR){ try{ toast('Speech to text is not supported in this browser'); }catch{} return; }
    const rec = new SR();
    rec.lang = (navigator && navigator.language) || 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    this._sttFinalText = (function(box){ return box ? (box.value||'') : ''; })($('#msBox'));
    this.ui.sttActive = true;
    this._rec = rec;
    rec.onresult = (evt)=>{
      const box = $('#msBox'); if (!box) return;
      let interim = '';
      for (let i = evt.resultIndex; i < evt.results.length; i++){
        const res = evt.results[i];
        const txt = res[0] && res[0].transcript ? res[0].transcript : '';
        if (!txt) continue;
        if (res.isFinal){
          this._sttFinalText = (this._sttFinalText ? (this._sttFinalText.trimEnd() + ' ') : '') + txt.trim();
          box.value = this._sttFinalText + ' ';
          this.ui.draft = box.value;
          try{ localStorage.setItem(draftKey(this.code), this.ui.draft); }catch{}
        }else{
          interim += txt;
        }
      }
      if (interim){ box.value = (this._sttFinalText? (this._sttFinalText + ' ') : '') + interim; }
    };
    rec.onerror = (e)=>{ this.ui.sttActive=false; try{ toast(e && e.error ? String(e.error) : 'Speech error'); }catch{} };
    rec.onend = ()=>{ this.ui.sttActive=false; };
    console.info && console.info('[MS] starting recognition, lang=', rec.lang);
    try { rec.start(); } catch (e) { this.ui.sttActive=false; try{ toast(e && e.message ? e.message : 'Cannot start speech'); }catch{} }
  },
  stopSTT(){
    try{
      if (this._rec){
        try{ this._rec.onresult=null; this._rec.onerror=null; this._rec.onend=null; }catch{}
        try{ this._rec.stop(); }catch{}
      }
    }catch{}
    this._rec = null;
    this.ui.sttActive = false;
  },

code:null, poll:null, tick:null, hbH:null, hbG:null,
  state:{ status:'lobby', endsAt:null, participants:[], question:null, current_turn:null, host_user_id:null },
  ui:{ lastSig:'', ansVisible:false, draft:'' },

  // --- Heartbeat diagnostics state (added) ---
  __hb:{ host:{fails:0,lastErr:null,lastStatus:null,lastAt:null}, guest:{fails:0,lastErr:null,lastStatus:null,lastAt:null}, logs:0, maxLogs:10 },

  async mount(code){

    this.code=code;
    try{ this.ui.draft = localStorage.getItem(draftKey(code)) || ''; }catch{ this.ui.draft=''; }
    try{ if (sessionStorage.getItem(hostMarkerKey(code))==='1'){ setRole(code, 'host'); sessionStorage.removeItem(hostMarkerKey(code)); } }catch{}
    await this.refresh();
    this.startPolling();
    this.startTick();
    this.startHeartbeats();
    try{
      if (!this.__wideResizeInstalled){
        this.__wideResizeInstalled = true;
        window.addEventListener('resize', ()=>{ try{ this._adjustAnswerWide(); }catch{} });
        window.addEventListener('orientationchange', ()=>{ try{ this._adjustAnswerWide(); }catch{} });
      }
    }catch{}
  },
  startPolling(){ if(this.poll) clearInterval(this.poll); this.poll=setInterval(()=>this.refresh(), 3000); },
  startTick(){ if(this.tick) clearInterval(this.tick); this.tick=setInterval(()=>this.renderTimer(), 1000); },

  // --- New: centralized heartbeat failure handler (no breaking changes) ---
  async _onHeartbeatFail(role, err, fn){
    try {
      const b = this.__hb[role] || (this.__hb[role] = {});
      b.fails = (b.fails||0) + 1;
      b.lastErr = (err && (err.message || String(err))) || 'unknown';
      b.lastStatus = (err && err.status) || null;
      b.lastAt = Date.now();
      if (this.__hb.logs < this.__hb.maxLogs){
        this.__hb.logs++;
        // Rate-limited, concise console signal
        console.warn(`[HB:${role}] heartbeat failed (#${b.fails})`, { status:b.lastStatus, msg:b.lastErr });
      }

      // One-time lightweight session refresh then retry once after 1s
      try { await getSession(); } catch(_) {}
      await new Promise(r=>setTimeout(r, 1000));

      try {
        await fn();
        // recovered
        b.fails = 0; b.lastStatus = 200; b.lastErr = null;
        if (this.__hb.logs < this.__hb.maxLogs){
          this.__hb.logs++;
          console.warn(`[HB:${role}] heartbeat recovered`);
        }
      } catch(e2){
        // keep failure count, let the regular interval try again next tick
        if (this.__hb.logs < this.__hb.maxLogs){
          this.__hb.logs++;
          console.warn(`[HB:${role}] retry failed, will back off naturally`, { msg: e2?.message || String(e2) });
        }
      }
      // Expose minimal debug surface for manual inspection if needed
      try { window.__HB_DEBUG = this.__hb; } catch {}
    } catch {}
  },

  startHeartbeats(){
    const code=this.code; const gid=resolveGameId(null);
    if (this.hbH) { clearInterval(this.hbH); this.hbH=null; }
    if (this.hbG) { clearInterval(this.hbG); this.hbG=null; }
    const role = getRole(code);

    // Host heartbeat every 20s with resilience
    if (role === 'host' && gid){
      const beatHost = async () => {
        try { await API.heartbeat(); this.__hb.host.fails = 0; }
        catch(e){ await this._onHeartbeatFail('host', e, API.heartbeat); }
      };
      this.hbH = setInterval(beatHost, 20000);
      // fire immediately
      beatHost();

      // Best-effort final beat on page exit
      const finalBeat = () => { try { API.heartbeat(); } catch(_) {} };
      try {
        // Avoid multiple listeners if startHeartbeats runs again
        if (!this.__finalBeatInstalled){
          window.addEventListener('pagehide', finalBeat, { capture:true });
          window.addEventListener('beforeunload', finalBeat, { capture:true });
          this.__finalBeatInstalled = true;
        }
      } catch {}
    } else {
      // Guest heartbeat every 25s with resilience
      const pid = JSON.parse(localStorage.getItem(msPidKey(code))||'null');
      if (pid && gid){
        const beatGuest = async () => {
          try { await API.participant_heartbeat(); this.__hb.guest.fails = 0; }
          catch(e){ await this._onHeartbeatFail('guest', e, API.participant_heartbeat); }
        };
        this.hbG = setInterval(beatGuest, 25000);
        beatGuest();
      }
    }
  },

  stop(){ try{ const tar=document.getElementById('topActionsRow'); if (tar) tar.innerHTML=''; }catch(_){}  if(this.poll) clearInterval(this.poll); if(this.tick) clearInterval(this.tick); if(this.hbH) clearInterval(this.hbH); if(this.hbG) clearInterval(this.hbG); },
  async refresh(){
    try{
      const out=await API.get_state({ code:this.code });
      await inferAndPersistHostRole(this.code, out);
      const status = out?.status || out?.phase || 'lobby';
      const endsAt = out?.ends_at || out?.endsAt || null;
      const participants = Array.isArray(out?.participants)? out.participants : (Array.isArray(out?.players)? out.players : []);
      const question = out?.question || null;
      const current_turn = out?.current_turn || null;
      const host_user_id = out?.host_user_id || out?.hostId || null;
      const sig = [status, endsAt, question?.id||'', current_turn?.participant_id||'', participants.length, host_user_id||''].join('|');
      const forceFull = (sig !== this.ui.lastSig);
      this.state = { status, endsAt, participants, question, current_turn, host_user_id };
      await this.backfillPidIfMissing();
      this.render(forceFull);
      this.ui.lastSig = sig;
      this.startHeartbeats();
    }catch(e){}
  },
  remainingSeconds(){ if (!this.state.endsAt) return null; const diff=Math.floor((new Date(this.state.endsAt).getTime()-Date.now())/1000); return Math.max(0,diff); },
  renderTimer(){
    const t=this.remainingSeconds(), el=document.getElementById('roomTimer'); if(!el) return;
    if (t==null) { el.textContent='--:--'; return; }
    const m=String(Math.floor(t/60)).padStart(2,'0'), s=String(t%60).padStart(2,'0');
    el.textContent=m+':'+s;
  },
  canAnswer(){
    const code=this.code; const pid = JSON.parse(localStorage.getItem(msPidKey(code))||'null');
    const cur = this.state.current_turn && this.state.current_turn.participant_id;
    return pid && cur && String(pid)===String(cur);
  },
  async backfillPidIfMissing(){
    const code=this.code;
    let pidRaw = localStorage.getItem(msPidKey(code));
    if (pidRaw) return;
    const participants = Array.isArray(this.state.participants)? this.state.participants : [];
    try{
      const sess = await getSession();
      const myUid = sess?.user?.id || null;
      if (myUid){
        const mine = participants.find(p => String(p.user_id||p.auth_user_id||p.owner_id||'') === String(myUid));
        if (mine && (mine.participant_id || mine.id)){
          localStorage.setItem(msPidKey(code), JSON.stringify(mine.participant_id || mine.id));
          return;
        }
      }
      const hostP = participants.find(p => p.is_host || p.role==='host');
      if (hostP && (hostP.participant_id || hostP.id)){
        if (getRole(code)==='host'){
          localStorage.setItem(msPidKey(code), JSON.stringify(hostP.participant_id || hostP.id));
          return;
        }
      }
    }catch{}
    try{
      const nick = localStorage.getItem('ms_nick_'+code);
      if (nick){
        const cand = participants.find(p => {
          const nm = (p.nickname || p.name || '').trim().toLowerCase();
          return nm && nm === nick.trim().toLowerCase();
        });
        if (cand && (cand.participant_id || cand.id)){
          localStorage.setItem(msPidKey(code), JSON.stringify(cand.participant_id || cand.id));
          return;
        }
      }
    }catch{}
  },
  
  // --- seating helpers ---
  seatOrder(hostId, ppl){
    const all = Array.isArray(ppl)? [...ppl] : [];
    const pidOf = p => p?.participant_id || p?.id || null;
    const uidOf = p => p?.user_id || p?.auth_user_id || p?.owner_id || p?.userId || p?.uid || null;
    const keyOf = p => String(pidOf(p) || uidOf(p) || '');

    if (!this.ui) this.ui = {};
    if (!this.ui.seatMap) this.ui.seatMap = {};
    if (typeof this.ui.nextSeat !== 'number') this.ui.nextSeat = 1;

    const presentKeys = new Set(all.map(keyOf).filter(k=>k));

    let host = null;
    if (hostId){
      host = all.find(p=> String(uidOf(p))===String(hostId) || p?.is_host===true || p?.role==='host') || null;
    }
    if (!host && all.length>0){
      host = all.find(p=> p?.is_host===true || p?.role==='host') || all[0];
    }

    if (host){
      const hk = keyOf(host) || 'h';
      this.ui.seatMap[hk] = 0;
    }

    const occupied = new Set(
      Object.entries(this.ui.seatMap)
        .filter(([k,v])=> presentKeys.has(k) && typeof v==='number' && v>=1 && v<=7)
        .map(([k,v])=> v)
    );

    const guests = all.filter(p=> p!==host);
    const lowestFree = () => {
      for (let s=1; s<=7; s++){
        if (!occupied.has(s)) return s;
      }
      return null;
    };

    for (const g of guests){
      const k = keyOf(g);
      if (!k) continue;
      let seat = this.ui.seatMap[k];
      if (seat == null){
        const free = lowestFree();
        if (free!=null){
          this.ui.seatMap[k] = free;
          occupied.add(free);
        }
      }
    }

    const entries = [];
    for (const p of all){
      const k = keyOf(p);
      const seat = this.ui.seatMap[k];
      if (typeof seat === 'number' && seat <= 7){
        entries.push({ idx: seat, p });
      }
    }
    entries.sort((a,b)=>a.idx-b.idx);
    return entries;
  },
  renderSeats(){

    const s=this.state;
    // Ensure containers exist
    let leftEl = document.getElementById('sideLeft');
    let rightEl = document.getElementById('sideRight');
    const mainCard = document.getElementById('mainCard');
    const roomMain = document.getElementById('roomMain');
    if (!leftEl || !rightEl){
      if (roomMain && mainCard){
        if (!leftEl){
          leftEl = document.createElement('div');
          leftEl.id = 'sideLeft';
                    roomMain.insertBefore(leftEl, mainCard);
        }
        if (!rightEl){
          rightEl = document.createElement('div');
          rightEl.id = 'sideRight';
                    if (mainCard.nextSibling){
            roomMain.insertBefore(rightEl, mainCard.nextSibling);
          }else{
            roomMain.appendChild(rightEl);
          }
        }
      }
    }
    if (!leftEl || !rightEl) return;

    leftEl.innerHTML = '<div class="seats seats-left" id="seatsLeft"></div>';
    rightEl.innerHTML = '<div class="seats seats-right" id="seatsRight"></div>';
    const L = document.getElementById('seatsLeft');
    const R = document.getElementById('seatsRight');
    if (!L || !R) return;

    const curPid = s.current_turn?.participant_id || null;
    const seats = this.seatOrder(s.host_user_id, s.participants);
    const leftIdx = new Set([0,2,4,6]);
    const rightIdx = new Set([1,3,5,7]);

    let __cu = null; try { __cu = (__msGetCachedUser && __msGetCachedUser()) || null; } catch(_) { __cu = null; }
    const __cuEmailName = (__cu && typeof __cu?.email==='string') ? (__cu.email.split('@')[0]||null) : null;
    const __cuDisplay = (__cu?.user_metadata?.name) || (__cu?.name) || null;
    const displayName = (p)=>{
      const uid = p?.user_id || p?.auth_user_id || p?.owner_id || p?.userId || p?.uid || '';
      let name = p?.profile_name || p?.nickname || p?.name || 'Guest';
      const isMe = !!(__cu && (
        (uid && String(uid)===String(__cu.id||'')) ||
        (__cuEmailName && typeof p?.name==='string' && p.name===__cuEmailName)
      ));
      if (isMe && __cuDisplay){ name = __cuDisplay; }
      return name;
    };

    // NEW: helper to compute initials from the display name
    const makeInitials = (name) => {
      if (!name || typeof name !== 'string') return 'G';
      const trimmed = name.trim();
      if (!trimmed) return 'G';
      const chars = Array.from(trimmed); // handles Unicode properly
      const first = (chars[0] || '').toLocaleUpperCase();
      const second = (chars[1] || '').toLocaleUpperCase();
      return second ? (first + second) : first;
    };

    seats.forEach(({idx, p})=>{
      const pid = p?.participant_id || p?.id || '';
      const role = p?.role || (p?.is_host ? 'host' : '');
      const el = document.createElement('div');
      el.className = 'seat-item' + ((curPid && String(curPid)===String(pid)) ? ' is-turn' : '');
      if (pid) el.dataset.pid = String(pid);

      const nameOnly = displayName(p);
      const initials = makeInitials(nameOnly);
      // Initials, optional crown for host, then name
      const crownHtml = (role==='host') ? '<img class="seat-crown" src="./assets/crown.png" alt="host" width="16" height="16">' : '';
      el.innerHTML = '<div class="seat-initials">'+ initials +'</div>'+
                     crownHtml +
                     '<div class="seat-name">'+ nameOnly +'</div>';

      if (leftIdx.has(idx)) L.appendChild(el);
      if (rightIdx.has(idx)) R.appendChild(el);
    });
    
  },

    mountHeaderActions(){
    const s=this.state;
    const frag=document.createDocumentFragment();

    // Timer element
    const timer=document.createElement('div');
    timer.className='ms-timer';
    timer.id='roomTimer';
    timer.textContent='--:--';
    frag.appendChild(timer);

    const role=getRole(this.code);
    const isHost=role==='host';

    if (s.status==='running' && isHost){
      const btnExtend=document.createElement('button');
      btnExtend.className='btn secondary ms-extend';
      btnExtend.id='extendBtnHeader';
      btnExtend.textContent='Extend';

      // Disabled by default, only enabled in last 10 minutes
      const t = this.remainingSeconds();
      const canExtendNow = (t != null && t <= 10 * 60);
      btnExtend.disabled = !canExtendNow;
      if (!canExtendNow){
        btnExtend.title = 'Extend becomes available in the last 10 minutes of the game.';
      }

      btnExtend.onclick = () => {
        if (btnExtend.disabled) return;
        const code = this.code || resolveGameId(null) || null;
        const roomCode = this.code || (typeof this.code === 'string' ? this.code : null);
        const c = roomCode || (code && String(code)) || null;
        if (c){
          location.hash = '#/billing?from=extend&code=' + encodeURIComponent(c);
        }else{
          location.hash = '#/billing?from=extend';
        }
      };

      frag.appendChild(btnExtend);
    }

    setHeaderActions(frag);
    this.renderTimer();
  },



  // --- ensure and size the wide answer mount under mic/keyboard ---
  _ensureAnswerWide(){
    try{
      const tools = document.getElementById('toolsRow');
      if (!tools) return null;
      let wide = document.getElementById('answerWide');
      if (!wide){
        wide = document.createElement('div');
        wide.id = 'answerWide';
        wide.className = 'answer-wide';
        if (tools.parentNode){
          tools.parentNode.insertBefore(wide, tools.nextSibling);
        }
      }
      this._adjustAnswerWide();
      return wide;
    }catch{ return null; }
  },
  _adjustAnswerWide(){
    try{
      const wide = document.getElementById('answerWide');
      const room = document.getElementById('roomMain');
      if (!wide || !room) return;
      const w = room.offsetWidth || room.clientWidth || null;
      if (w){ wide.style.maxWidth = w + 'px'; }
      wide.style.margin = '12px auto 0';
      wide.style.display = 'block';
      wide.style.padding = '0';
    }catch{}
  },

  // --- align arbitrary rows to #roomMain width for consistent centering (mobile-safe) ---
render(forceFull){
    const s=this.state; const main=$('#mainCard'); const controls=$('#controlsRow'); const answer=$('#answerRow'); const tools=$('#toolsRow'); const side=$('#sideLeft');
    // Toggle card visual state classes without changing layout or content
    if (main && main.classList) {
      main.classList.remove('card--idle','card--running');
      const st = s.status || 'lobby';
      if (st === 'running') {
        main.classList.add('card--running');
      } else {
        main.classList.add('card--idle');
      }
    }

    if (!main || !controls) return;
    if (forceFull){ main.innerHTML=''; controls.innerHTML=''; if(answer) answer.innerHTML=''; if(tools) tools.innerHTML=''; if(side) side.innerHTML=''; try{ const aw=document.getElementById('answerWide'); if(aw){ aw.innerHTML=''; } this._ensureAnswerWide(); }catch{} }
/* removed legacy in-card timer */
    if (s.status==='lobby'){ try{ const tar=document.getElementById('topActionsRow'); if (tar) tar.innerHTML=''; }catch(_){}  clearHeaderActions();
      if (forceFull){
        const wrap=document.createElement('div'); wrap.id='msLobby'; wrap.className='lobby-wrap';
        this.renderSeats();

        const role=getRole(this.code);
        if (role==='host'){
          const startBtn=document.createElement('button'); startBtn.className='start-round'; startBtn.id='startGame'; startBtn.textContent='Start';
          const enough = Array.isArray(s.participants) && s.participants.length>=2;
          startBtn.disabled = !enough;
          startBtn.onclick=async()=>{
            try{
              const out = await API.start_game();
              const g = out?.game || out || {};
              if (g && (g.status || g.phase)){
                this.state.status = g.status || g.phase;
                this.state.endsAt = g.ends_at || g.endsAt || null;
              }
              await this.refresh();
            }catch(e){ toast(e.message||'Start failed'); }
          };
          const help=document.createElement('div'); help.className='help'; help.id='msLobbyHelp'; help.textContent = enough ? 'Ready to start.' : 'Need at least 2 players to start.';
          wrap.appendChild(startBtn); wrap.appendChild(help);
        }else{
          const wait=document.createElement('div'); wait.className='help'; wait.textContent='Waiting for the host to start';
          wrap.appendChild(wait);
        }
        main.appendChild(wrap);
      }else{
        this.renderSeats();
        const startBtn=$('#startGame'); if (startBtn){ const enough = Array.isArray(s.participants) && s.participants.length>=2; startBtn.disabled=!enough; }
      }
      this.renderTimer(); try{ this._adjustAnswerWide(); }catch{}
      return;
    }

    if (s.status==='running') { try{ const tar=document.getElementById('topActionsRow'); if (tar){ const role=getRole(this.code); const isHost=(role==='host'); tar.innerHTML = isHost ? '<button id="endAnalyzeTop" class="btn danger">End game & analyze</button>' : ''; if (isHost){ document.getElementById('endAnalyzeTop').onclick = async()=>{ try{ await API.end_game_and_analyze(); await this.refresh(); }catch(e){ toast(e.message||"End failed"); } }; } } }catch(_){}  this.mountHeaderActions();
      if (forceFull){
        const q=document.createElement('div'); q.id='msQ'; q.className='question-block';
        q.innerHTML = '<h4 style="margin:0 0 8px 0;">'+(s.question?.text || '')+'</h4>';
        main.appendChild(q);
        
        // Clarification overlay hook (bottom-right "?" + small over-card panel)
        try {
          if (!this.__clarInit) { initClarificationOverlay(); this.__clarInit = true; }
          const __hostEl = q.closest ? (q.closest('.card') || q) : q;
          setHostElement(__hostEl);
          setClarification((s.question && s.question.clarification) ? String(s.question.clarification) : '');
          syncClarificationButton();
        } catch(_) {}
// v10: Show guidance when game is running and there is no active turn
        try{
          const stRunning = (s.status||'') === 'running';
          const activeTurn = !!(s.current_turn && s.current_turn.participant_id);
          if (stRunning && !activeTurn){
            const help=document.createElement('p'); help.className='help';
            help.textContent='Please click on Next Card to reveal the next question.';
            q.appendChild(help);
          }
        }catch{}

        this.renderSeats();

        // v8: Toggle Next Card button based on round state
        try{
          const s=this.state; const next=$('#nextCard')||document.getElementById('nextCard');
          if (next){ const active = !!(s.current_turn && s.current_turn.participant_id); next.disabled = !!active; next.setAttribute('aria-disabled', active ? 'true' : 'false'); }
          if (next){
            const isButton = next.tagName && next.tagName.toLowerCase() === 'button';
            if (active){
              if (isButton){ next.disabled = true; }
              next.setAttribute('aria-disabled','true'); next.classList.add('disabled','btn-disabled');
              try{ next.style.setProperty('opacity','0.5','important'); }catch{}
              try{ next.style.setProperty('filter','grayscale(1)','important'); }catch{}
              try{ next.style.setProperty('pointer-events','none','important'); }catch{}
              try{ next.style.setProperty('cursor','not-allowed','important'); }catch{}
              try{ next.setAttribute('tabindex','-1'); }catch{}
            } else {
              if (isButton){ next.disabled = false; }
              next.removeAttribute('aria-disabled'); next.classList.remove('disabled','btn-disabled');
              try{ next.style.setProperty('opacity','', 'important'); }catch{}
              try{ next.style.setProperty('filter','', 'important'); }catch{}
              try{ next.style.setProperty('pointer-events','', 'important'); }catch{}
              try{ next.style.setProperty('cursor','', 'important'); }catch{}
              try{ next.removeAttribute('tabindex'); }catch{}
            }
          }
          if (next){
            const isButton = next.tagName && next.tagName.toLowerCase() === 'button';
            if (active){
              if (isButton){ next.disabled = true; }
              next.setAttribute('aria-disabled','true'); next.classList.add('disabled','btn-disabled');
              try{ next.style.setProperty('opacity','0.5','important'); }catch{}
              try{ next.style.setProperty('filter','grayscale(1)','important'); }catch{}
              try{ next.style.setProperty('pointer-events','none','important'); }catch{}
              try{ next.style.setProperty('cursor','not-allowed','important'); }catch{}
              try{ next.setAttribute('tabindex','-1'); }catch{}
            } else {
              if (isButton){ next.disabled = false; }
              next.removeAttribute('aria-disabled'); next.classList.remove('disabled','btn-disabled');
              try{ next.style.setProperty('opacity','', 'important'); }catch{}
              try{ next.style.setProperty('filter','', 'important'); }catch{}
              try{ next.style.setProperty('pointer-events','', 'important'); }catch{}
              try{ next.style.setProperty('cursor','', 'important'); }catch{}
              try{ next.removeAttribute('tabindex'); }catch{}
            }
          }
          if (next){
            if (active){ next.setAttribute('aria-disabled','true'); next.classList.add('disabled'); next.style.opacity='0.5'; next.style.pointerEvents='none'; next.style.cursor='not-allowed'; }
            else { next.removeAttribute('aria-disabled'); next.classList.remove('disabled'); next.style.opacity=''; next.style.pointerEvents=''; next.style.cursor=''; }
          }
        }catch{}

        const actRow=document.createElement('div'); actRow.id='msActRow'; actRow.className='kb-mic-row';
        const can = this.canAnswer();
        actRow.innerHTML=
          '<img id="micBtn" class="tool-icon'+((this.ui&&this.ui.inputTool==='mic')?' active':'')+(can?'':' disabled')+'" src="./assets/mic.png" alt="mic"/>'+
          '<img id="kbBtn" class="tool-icon'+((this.ui&&this.ui.inputTool==='kb')?' active':'')+(can?'':' disabled')+'" src="./assets/keyboard.png" alt="keyboard"/>';
        (tools||main).appendChild(actRow);
        // v7: mic starts STT within click gesture BEFORE re-render; toggles off if already listening
        $('#micBtn').onclick=()=>{ if (!this.canAnswer()) return; console.info && console.info('[MS] mic click');
          if (this.ui && this.ui.sttActive){ try{ this.stopSTT(); }catch{} this.ui.sttActive=false; this.ui.inputTool=null; this.render(true); return; }
          this.ui.ansVisible=true; this.ui.inputTool='mic';
          try{ this.startSTT(); }catch{}
          this.render(true);
          const box=$('#msBox'); if (box){ try{ box.focus(); box.setSelectionRange(box.value.length, box.value.length);}catch{} }
        };
        $('#kbBtn').onclick=()=>{ if (!this.canAnswer()) return; try{ this.stopSTT(); }catch{} this.ui.ansVisible=true; this.ui.inputTool='kb'; this.render(true); const box=$('#msBox'); if (box){ try{ box.focus(); box.setSelectionRange(box.value.length, box.value.length);}catch{} } };
        // v5 override: toggle mic STT and stop STT on keyboard
        $('#micBtn').onclick=()=>{ if (!this.canAnswer()) return; if (this.ui && this.ui.sttActive){ try{ this.stopSTT(); }catch{} this.ui.sttActive=false; this.render(true); return; } this.ui.ansVisible=true; this.ui.inputTool='mic'; const mic=$('#micBtn'), kb=$('#kbBtn'); if (mic) mic.classList.add('active'); if (kb) kb.classList.remove('active'); this.render(true); const box=$('#msBox'); if (box){ try{ box.focus(); box.setSelectionRange(box.value.length, box.value.length);}catch{} } try{ this.startSTT(); }catch{} };
        $('#kbBtn').onclick=()=>{ if (!this.canAnswer()) return; try{ this.stopSTT(); }catch{} this.ui.ansVisible=true; this.ui.inputTool='kb'; const mic=$('#micBtn'), kb=$('#kbBtn'); if (kb) kb.classList.add('active'); if (mic) mic.classList.remove('active'); this.render(true); const box=$('#msBox'); if (box){ try{ box.focus(); box.setSelectionRange(box.value.length, box.value.length);}catch{} } };
        $('#micBtn').onclick=()=>{ if (!this.canAnswer()) return; this.ui.ansVisible=true; this.ui.inputTool='mic'; const mic=$('#micBtn'), kb=$('#kbBtn'); if (mic) mic.classList.add('active'); if (kb) kb.classList.remove('active'); this.render(true); };
        $('#kbBtn').onclick=()=>{ if (!this.canAnswer()) return; this.ui.ansVisible=true; this.ui.inputTool='kb'; const mic=$('#micBtn'), kb=$('#kbBtn'); if (kb) kb.classList.add('active'); if (mic) mic.classList.remove('active'); this.render(true); };
      }else{
        this.renderSeats();
        // v8: Toggle Next Card button in update path
        try{
          const s=this.state; const next=$('#nextCard')||document.getElementById('nextCard');
          if (next){ const active = !!(s.current_turn && s.current_turn.participant_id); next.toggleAttribute('disabled', active); }
        }catch{}
        const can=this.canAnswer(); const mic=$('#micBtn'); const kb=$('#kbBtn');
        if (mic) mic.classList.toggle('disabled', !can);
        if (kb) kb.classList.toggle('disabled', !can);
        if (mic) { if (this.ui&&this.ui.inputTool==='mic') mic.classList.add('active'); else mic.classList.remove('active'); }
        if (kb) { if (this.ui&&this.ui.inputTool==='kb') kb.classList.add('active'); else kb.classList.remove('active'); }
        if (mic) mic.onclick = ()=>{ if (!this.canAnswer()) return; console.info && console.info('[MS] mic click'); if (this.ui && this.ui.sttActive){ try{ this.stopSTT(); }catch{} this.ui.sttActive=false; this.ui.inputTool=null; this.render(true); return; } this.ui.ansVisible=true; this.ui.inputTool='mic'; try{ this.startSTT(); }catch{} this.render(true); const box=$('#msBox'); if (box){ try{ box.focus(); box.setSelectionRange(box.value.length, box.value.length);}catch{} } };
        if (kb) kb.onclick = ()=>{ if (!this.canAnswer()) return; try{ this.stopSTT(); }catch{} this.ui.ansVisible=true; this.ui.inputTool='kb'; this.render(true); const box=$('#msBox'); if (box){ try{ box.focus(); box.setSelectionRange(box.value.length, box.value.length);}catch{} } };
        if (!can) { try{ this.stopSTT(); }catch{} }
      }

      if (this.ui.ansVisible){
        try{ this._ensureAnswerWide(); }catch{}
        let ans=$('#msAns');
        if (!ans){
          ans=document.createElement('div'); ans.className='answer-card'; ans.id='msAns';
          const placeholder = this.canAnswer()? 'Type here...' : 'Wait for your turn';
          ans.innerHTML =
            '<div class="meta">Your answer</div>'+
            '<textarea id="msBox" class="input" rows="3" placeholder="'+placeholder+'"></textarea>'+
            '<div class="row actions-row" style="display:flex;justify-content:flex-end">'+
              '<button id="submitBtn" class="btn"'+(this.canAnswer()?'':' disabled')+'>Submit</button>'+
            '</div>';
          (function(){
            const wide = (typeof Game!=='undefined' && Game._ensureAnswerWide) ? Game._ensureAnswerWide() : null;
            const mount = wide || (answer||main);
            mount.appendChild(ans);
          })();
          const box=$('#msBox'); if (box){ box.value = this.ui.draft||''; box.addEventListener('input', ()=>{ this.ui.draft=box.value; try{ localStorage.setItem(draftKey(this.code), this.ui.draft); }catch{} }); }
          const submit=$('#submitBtn'); if (submit) submit.onclick=async()=>{
            const box=$('#msBox'); const text=(box.value||'').trim(); if(!text) return;
            try{ submit.disabled=true; await API.submit_answer({ text }); try{ this.stopSTT(); }catch{} this.ui.draft=''; try{ localStorage.removeItem(draftKey(this.code)); }catch{} this.ui.ansVisible=false; this.ui.inputTool=null; const mic=$('#micBtn'), kb=$('#kbBtn'); if(mic) mic.classList.remove('active'); if(kb) kb.classList.remove('active'); try{ const an=document.getElementById('msAns'); if(an&&an.parentNode){ an.parentNode.removeChild(an); } }catch{}
            this.render(true); box.value=''; this.ui.draft=''; try{ localStorage.removeItem(draftKey(this.code)); }catch{} await this.refresh(); }catch(e){ submit.disabled=false; toast(e.message||'Submit failed'); }
          };
        }else{
          const box=$('#msBox'); if (box){ box.placeholder = this.canAnswer()? 'Type here...' : 'Wait for your turn'; box.toggleAttribute('disabled', !this.canAnswer()); }
          const submit=$('#submitBtn'); if (submit){ submit.toggleAttribute('disabled', !this.canAnswer()); }
        }
      }

      const role=getRole(this.code); const isHost = role==='host';
      if (isHost && forceFull){
        controls.innerHTML=
          '<button id="nextCard" class="cta" '+( (s.current_turn && s.current_turn.participant_id) ? 'disabled' : '' )+'>'+'<img src="./assets/next-card.png" alt="Next"/><span>Next Card</span></button>';
        $('#nextCard').onclick=async()=>{ try{ await API.next_question(); await this.refresh(); }catch(e){ toast(e.message||'Next failed'); } };
      }else if (!isHost){ controls.innerHTML=''; }

      this.renderTimer(); try{ this._adjustAnswerWide(); }catch{}
      return;
    }

    if (s.status==='ended'){ try{ const tar=document.getElementById('topActionsRow'); if (tar) tar.innerHTML=''; }catch(_){}  clearHeaderActions();
  controls.innerHTML='';
  // Render seats around the card
  this.renderSeats();
  // Mount the new Summary module inside the main card
  const main = document.getElementById('mainCard');
  try{
    const code=this.code;
    let myPid=null; try{ myPid = JSON.parse(localStorage.getItem(msPidKey(code))||'null'); }catch(_){ myPid=null; }
    const role=getRole(this.code);
    const isHost = role==='host';
    // Compute deterministic seat indexes even after end
    const entries = this.seatOrder(this.state.host_user_id, this.state.participants||[]);
    const mappedParticipants = entries.map(e=>({ ...e.p, seat_index: e.idx }));
    const stateForSummary = { ...this.state, participants: mappedParticipants };
    const firstSeat = (entries.map(e=>e.idx)[0]||null);
    Summary.mount({ container: main, state: stateForSummary, selectedSeat: firstSeat, code: this.code, myPid, isHost });
  }catch(e){ try{ toast(e.message||'Failed to render summary'); }catch(_){} }
  return;
}

  }
};

export async function render(ctx){
  const code = ctx?.code || null;
  const app=document.getElementById('app');
  app.innerHTML=
    '<div class="offline-banner">You are offline. Trying to reconnect…</div>'+
    '<div class="top-actions-row" id="topActionsRow"></div>'+
      '<div class="room-wrap">'+
      '<div class="controls-row" id="controlsRow"></div>'+
      '<div id="roomMain">'+
        '<div id="sideLeft"></div>'+
        '<div class="card main-card" id="mainCard"></div>'+
        '<div id="sideRight"></div>'+
      '</div>'+
      '<div class="controls-row" id="toolsRow"></div>'+
      '<div class="answer-row" id="answerRow"></div>'+
    '</div>';
  await renderHeader(); ensureDebugTray();
  try{ document.body.classList.add('is-game'); }catch{}
  const _ms_onHash = () => { if (!location.hash.startsWith('#/game/')) { try{ document.body.classList.remove('is-game'); }catch{} window.removeEventListener('hashchange', _ms_onHash); } };
  window.addEventListener('hashchange', _ms_onHash);
if (code){ Game.mount(code); }
}
