// game.js
import { API, msPidKey, resolveGameId, getRole, setRole, draftKey, hostMarkerKey, inferAndPersistHostRole, getSession } from './api.js';
import { renderHeader, ensureDebugTray, $, toast, participantsListHTML, ensureProfileNamesForParticipants } from './ui.js';

const Game = {
  code:null, poll:null, tick:null, hbH:null, hbG:null,
  state:{ status:'lobby', endsAt:null, participants:[], question:null, current_turn:null, host_user_id:null },
  ui:{ lastSig:'', ansVisible:false, draft:'' },
  async mount(code){
    this.code=code;
    try{ this.ui.draft = localStorage.getItem(draftKey(code)) || ''; }catch{ this.ui.draft=''; }
    try{ if (sessionStorage.getItem(hostMarkerKey(code))==='1'){ setRole(code, 'host'); sessionStorage.removeItem(hostMarkerKey(code)); } }catch{}
    await this.refresh();
    this.startPolling();
    this.startTick();
    this.startHeartbeats();
  },
  startPolling(){ if(this.poll) clearInterval(this.poll); this.poll=setInterval(()=>this.refresh(), 3000); },
  startTick(){ if(this.tick) clearInterval(this.tick); this.tick=setInterval(()=>this.renderTimer(), 1000); },
  startHeartbeats(){
    const code=this.code; const gid=resolveGameId(null);
    if (this.hbH) { clearInterval(this.hbH); this.hbH=null; }
    if (this.hbG) { clearInterval(this.hbG); this.hbG=null; }
    const role = getRole(code);
    if (role === 'host' && gid){
      const beat=()=>API.heartbeat().catch(()=>{});
      this.hbH = setInterval(beat, 20000); beat();
    } else {
      const pid = JSON.parse(localStorage.getItem(msPidKey(code))||'null');
      if (pid && gid){
        const beat=()=>API.participant_heartbeat().catch(()=>{});
        this.hbG = setInterval(beat, 25000); beat();
      }
    }
  },
  stop(){ if(this.poll) clearInterval(this.poll); if(this.tick) clearInterval(this.tick); if(this.hbH) clearInterval(this.hbH); if(this.hbG) clearInterval(this.hbG); },
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
    el.textContent=`${m}:${s}`;
  },
  canAnswer(){
    const code=this.code; const pid = JSON.parse(localStorage.getItem(msPidKey(code))||'null');
    const cur = this.state.current_turn && this.state.current_turn.participant_id;
    return pid && cur && String(pid)===String(cur);
  },
  async backfillPidIfMissing(){
    const code=this.code;
    // If we already have a pid, nothing to do
    let pidRaw = localStorage.getItem(msPidKey(code));
    if (pidRaw) return;
    const participants = Array.isArray(this.state.participants)? this.state.participants : [];
    // Try host match by auth user id or is_host flag
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
      // If role indicates we are host, try the is_host participant
      const hostP = participants.find(p => p.is_host || p.role==='host');
      if (hostP && (hostP.participant_id || hostP.id)){
        if (getRole(code)==='host'){
          localStorage.setItem(msPidKey(code), JSON.stringify(hostP.participant_id || hostP.id));
          return;
        }
      }
    }catch{}
    // Guest nickname fallback: map by stored nickname
    try{
      const nick = localStorage.getItem(`ms_nick_${code}`);
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
  render(forceFull){
    const s=this.state; const main=$('#mainCard'); const controls=$('#controlsRow');
    if (!main || !controls) return;
    if (forceFull){ main.innerHTML=''; controls.innerHTML=''; }

    let topRight=$('#msTopRight');
    if (!topRight){ topRight=document.createElement('div'); topRight.id='msTopRight'; topRight.style.cssText='position:absolute; top:16px; right:16px; font-weight:800; display:flex; gap:12px; align-items:center;'; main.appendChild(topRight); }
    topRight.innerHTML = (s.status==='running' ? `⏱ <span id="roomTimer">--:--</span>` : '');

    if (s.status==='lobby'){
      if (forceFull){
        const wrap=document.createElement('div'); wrap.id='msLobby'; wrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:10px; text-align:center; max-width:640px;';
        const plist=document.createElement('div'); plist.id='msPlist';
        plist.innerHTML=participantsListHTML(s.participants, s.current_turn?.participant_id||null)
        ensureProfileNamesForParticipants(s.participants).then(()=>{ try{ plist.innerHTML=participantsListHTML(s.participants, s.current_turn?.participant_id||null) }catch{} }); wrap.appendChild(plist);

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
        const plist=$('#msPlist');
        plist && (plist.innerHTML=participantsListHTML(s.participants, s.current_turn?.participant_id||null));
        ensureProfileNamesForParticipants(s.participants).then(()=>{ const p=$('#msPlist'); if (p) p.innerHTML=participantsListHTML(s.participants, s.current_turn?.participant_id||null); });
        const startBtn=$('#startGame'); if (startBtn){ const enough = Array.isArray(s.participants) && s.participants.length>=2; startBtn.disabled=!enough; }
      }
      return;
    }

    if (s.status==='running'){
      if (forceFull){
        const q=document.createElement('div'); q.id='msQ'; q.style.cssText='text-align:center; max-width:640px; padding:8px; margin-top:8px;';
        q.innerHTML = `<h3 style="margin:0 0 8px 0;">${s.question?.title || 'Question'}</h3><p class="help" style="margin:0;">${s.question?.text || ''}</p>`;
        main.appendChild(q);

        const plist=document.createElement('div'); plist.id='msPlistRun';
        plist.innerHTML=participantsListHTML(s.participants, s.current_turn?.participant_id||null)
        ensureProfileNamesForParticipants(s.participants).then(()=>{ try{ plist.innerHTML=participantsListHTML(s.participants, s.current_turn?.participant_id||null) }catch{} }); plist.style.marginTop = '6px'; main.appendChild(plist);

        const actRow=document.createElement('div'); actRow.id='msActRow'; actRow.className='kb-mic-row';
        const can = this.canAnswer();
        actRow.innerHTML=`
          <button id="micBtn" class="kb-mic-btn" ${can?'':'disabled'}><img src="./assets/mic.png" alt="mic"/> <span>Mic</span></button>
          <button id="kbBtn" class="kb-mic-btn" ${can?'':'disabled'}><img src="./assets/keyboard.png" alt="kb"/> <span>Keyboard</span></button>`;
        main.appendChild(actRow);
        $('#micBtn').onclick=()=>{ if (!this.canAnswer()) return; this.ui.ansVisible=true; this.render(true); };
        $('#kbBtn').onclick=()=>{ if (!this.canAnswer()) return; this.ui.ansVisible=true; this.render(true); };
      }else{
        const plist=$('#msPlistRun');
        plist && (plist.innerHTML=participantsListHTML(s.participants, s.current_turn?.participant_id||null));
        ensureProfileNamesForParticipants(s.participants).then(()=>{ const p=$('#msPlistRun'); if (p) p.innerHTML=participantsListHTML(s.participants, s.current_turn?.participant_id||null); });
        const can=this.canAnswer(); const mic=$('#micBtn'); const kb=$('#kbBtn');
        if (mic) mic.toggleAttribute('disabled', !can); if (kb) kb.toggleAttribute('disabled', !can);
      }

      if (this.ui.ansVisible){
        let ans=$('#msAns');
        if (!ans){
          ans=document.createElement('div'); ans.className='card'; ans.id='msAns'; ans.style.marginTop='8px';
          ans.innerHTML = `
            <div class="meta">Your answer</div>
            <textarea id="msBox" class="input" rows="3" placeholder="${this.canAnswer()?'Type here…':'Wait for your turn'}"></textarea>
            <div class="row" style="gap:8px;margin-top:6px;">
              <button id="submitBtn" class="btn"${this.canAnswer()?'':' disabled'}>Submit</button>
            </div>`;
          main.appendChild(ans);
          const box=$('#msBox'); if (box){ box.value = this.ui.draft||''; box.addEventListener('input', ()=>{ this.ui.draft=box.value; try{ localStorage.setItem(draftKey(this.code), this.ui.draft); }catch{} }); }
          const submit=$('#submitBtn'); if (submit) submit.onclick=async()=>{
            const box=$('#msBox'); const text=(box.value||'').trim(); if(!text) return;
            try{ submit.disabled=true; await API.submit_answer({ text }); box.value=''; this.ui.draft=''; try{ localStorage.removeItem(draftKey(this.code)); }catch{} await this.refresh(); }catch(e){ submit.disabled=false; toast(e.message||'Submit failed'); }
          };
        }else{
          const box=$('#msBox'); if (box){ box.placeholder = this.canAnswer()? 'Type here…' : 'Wait for your turn'; box.toggleAttribute('disabled', !this.canAnswer()); }
          const submit=$('#submitBtn'); if (submit){ submit.toggleAttribute('disabled', !this.canAnswer()); }
        }
      }

      const role=getRole(this.code); const isHost = role==='host';
      if (isHost && forceFull){
        controls.innerHTML=`
          <button id="nextCard" class="btn">Reveal next card</button>
          <button id="extendBtn" class="btn secondary" disabled>Extend</button>
          <button id="endAnalyze" class="btn danger">End and analyze</button>`;
        $('#nextCard').onclick=async()=>{ try{ await API.next_question(); await this.refresh(); }catch(e){ toast(e.message||'Next failed'); } };
        $('#extendBtn').onclick=()=>{ location.hash='#/billing'; };
        $('#endAnalyze').onclick=async()=>{ try{ await API.end_game_and_analyze(); await this.refresh(); }catch(e){ toast(e.message||'End failed'); } };
      }else if (!isHost){ controls.innerHTML=''; }

      this.renderTimer();
      return;
    }

    if (s.status==='ended'){
      controls.innerHTML='';
      main.innerHTML = `
        <div style="text-align:center; max-width:640px;">
          <h3>Summary</h3>
          <p class="help">The game has ended. You can start a new one from Host page.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
            <a class="btn" href="#/host">Host a new game</a>
            <button id="shareBtn" class="btn secondary">Share</button>
          </div>
        </div>`;
      $('#shareBtn').onclick=()=>{ navigator.clipboard.writeText(location.origin+location.pathname+'#/'); toast('Link copied'); };
      return;
    }
  }
};

export async function render(ctx){
  const code = ctx?.code || null;
  const app=document.getElementById('app');
  app.innerHTML=`
    <div class="offline-banner">You are offline. Trying to reconnect…</div>
    <div class="room-wrap">
      <div class="card main-card" id="mainCard"></div>
      <div class="controls-row" id="controlsRow"></div>
    </div>`;
  await renderHeader(); ensureDebugTray();
  // Apply game theme via body class, and clean it when leaving
  try{ document.body.classList.add('is-game'); }catch{}
  const _ms_onHash = () => { if (!location.hash.startsWith('#/game/')) { try{ document.body.classList.remove('is-game'); }catch{} window.removeEventListener('hashchange', _ms_onHash); } };
  window.addEventListener('hashchange', _ms_onHash);
await renderHeader(); ensureDebugTray();// Make header/footer black only in game room, without touching global CSS
  if (code){ Game.mount(code); }
}
