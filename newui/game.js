// game.js
import { API, msPidKey, resolveGameId, getRole, setRole, draftKey, hostMarkerKey, inferAndPersistHostRole, getSession } from './api.js';
import { renderHeader, ensureDebugTray, $, toast, participantsListHTML } from './ui.js';

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
  render(forceFull){
    const s=this.state; const main=$('#mainCard'); const controls=$('#controlsRow'); const answer=$('#answerRow'); const tools=$('#toolsRow'); const side=$('#sideLeft');
    if (!main || !controls) return;
    if (forceFull){ main.innerHTML=''; controls.innerHTML=''; if(answer) answer.innerHTML=''; if(tools) tools.innerHTML=''; if(side) side.innerHTML=''; }

    let topRight=$('#msTopRight');
    if (!topRight){ topRight=document.createElement('div'); topRight.id='msTopRight'; topRight.className='top-right'; main.appendChild(topRight); }
    topRight.innerHTML = (s.status==='running' ? '<span>⏱</span> <span id=\"roomTimer\">--:--</span>' : '');

    if (s.status==='lobby'){
      if (forceFull){
        const wrap=document.createElement('div'); wrap.id='msLobby'; wrap.className='lobby-wrap';
        const plist=document.createElement('div'); plist.id='msPlist'; plist.innerHTML=participantsListHTML(s.participants, s.current_turn?.participant_id||null); (side||wrap).appendChild(plist);

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
        const plist=$('#msPlist'); if (plist) plist.innerHTML=participantsListHTML(s.participants, s.current_turn?.participant_id||null);
        const startBtn=$('#startGame'); if (startBtn){ const enough = Array.isArray(s.participants) && s.participants.length>=2; startBtn.disabled=!enough; }
      }
      this.renderTimer();
      return;
    }

    if (s.status==='running'){
      if (forceFull){
        const q=document.createElement('div'); q.id='msQ'; q.className='question-block';
        q.innerHTML = '<h3 style=\"margin:0 0 8px 0;\">'+(s.question?.title || 'Question')+'</h3><p class=\"help\" style=\"margin:0;\">'+(s.question?.text || '')+'</p>';
        main.appendChild(q);

        const plist=document.createElement('div'); plist.id='msPlistRun'; plist.innerHTML=participantsListHTML(s.participants, s.current_turn?.participant_id||null); (side||main).appendChild(plist);

        const actRow=document.createElement('div'); actRow.id='msActRow'; actRow.className='kb-mic-row';
        const can = this.canAnswer();
        actRow.innerHTML=
          '<button id=\"micBtn\" class=\"kb-mic-btn\" '+(can?'':'disabled')+'><img src=\"./assets/mic.png\" alt=\"mic\"/> <span>Mic</span></button>'+
          '<button id=\"kbBtn\" class=\"kb-mic-btn\" '+(can?'':'disabled')+'><img src=\"./assets/keyboard.png\" alt=\"kb\"/> <span>Keyboard</span></button>';
        (tools||main).appendChild(actRow);
        $('#micBtn').onclick=()=>{ if (!this.canAnswer()) return; this.ui.ansVisible=true; this.render(true); };
        $('#kbBtn').onclick=()=>{ if (!this.canAnswer()) return; this.ui.ansVisible=true; this.render(true); };
      }else{
        const plist=$('#msPlistRun'); if (plist) plist.innerHTML=participantsListHTML(s.participants, s.current_turn?.participant_id||null);
        const can=this.canAnswer(); const mic=$('#micBtn'); const kb=$('#kbBtn');
        if (mic) mic.toggleAttribute('disabled', !can); if (kb) kb.toggleAttribute('disabled', !can);
      }

      if (this.ui.ansVisible){
        let ans=$('#msAns');
        if (!ans){
          ans=document.createElement('div'); ans.className='card answer-card'; ans.id='msAns';
          const placeholder = this.canAnswer()? 'Type here...' : 'Wait for your turn';
          ans.innerHTML =
            '<div class=\"meta\">Your answer</div>'+
            '<textarea id=\"msBox\" class=\"input\" rows=\"3\" placeholder=\"'+placeholder+'\"></textarea>'+
            '<div class=\"row actions-row\">'+
              '<button id=\"submitBtn\" class=\"btn\"'+(this.canAnswer()?'':' disabled')+'>Submit</button>'+
            '</div>';
          (answer||main).appendChild(ans);
          const box=$('#msBox'); if (box){ box.value = this.ui.draft||''; box.addEventListener('input', ()=>{ this.ui.draft=box.value; try{ localStorage.setItem(draftKey(this.code), this.ui.draft); }catch{} }); }
          const submit=$('#submitBtn'); if (submit) submit.onclick=async()=>{
            const box=$('#msBox'); const text=(box.value||'').trim(); if(!text) return;
            try{ submit.disabled=true; await API.submit_answer({ text }); box.value=''; this.ui.draft=''; try{ localStorage.removeItem(draftKey(this.code)); }catch{} await this.refresh(); }catch(e){ submit.disabled=false; toast(e.message||'Submit failed'); }
          };
        }else{
          const box=$('#msBox'); if (box){ box.placeholder = this.canAnswer()? 'Type here...' : 'Wait for your turn'; box.toggleAttribute('disabled', !this.canAnswer()); }
          const submit=$('#submitBtn'); if (submit){ submit.toggleAttribute('disabled', !this.canAnswer()); }
        }
      }

      const role=getRole(this.code); const isHost = role==='host';
      if (isHost && forceFull){
        controls.innerHTML=
          '<button id=\"nextCard\" class=\"btn\">Reveal next card</button>'+
          '<button id=\"extendBtn\" class=\"btn secondary\" disabled>Extend</button>'+
          '<button id=\"endAnalyze\" class=\"btn danger\">End and analyze</button>';
        $('#nextCard').onclick=async()=>{ try{ await API.next_question(); await this.refresh(); }catch(e){ toast(e.message||'Next failed'); } };
        $('#extendBtn').onclick=()=>{ location.hash='#/billing'; };
        $('#endAnalyze').onclick=async()=>{ try{ await API.end_game_and_analyze(); await this.refresh(); }catch(e){ toast(e.message||'End failed'); } };
      }else if (!isHost){ controls.innerHTML=''; }

      this.renderTimer();
      return;
    }

    if (s.status==='ended'){
      controls.innerHTML='';
      main.innerHTML =
        '<div style=\"text-align:center; max-width:640px;\">'+
          '<h3>Summary</h3>'+
          '<p class=\"help\">The game has ended. You can start a new one from Host page.</p>'+
          '<div style=\"display:flex;gap:10px;flex-wrap:wrap;justify-content:center;\">'+
            '<a class=\"btn\" href=\"#/host\">Host a new game</a>'+
            '<button id=\"shareBtn\" class=\"btn secondary\">Share</button>'+
          '</div>'+
        '</div>';
      $('#shareBtn').onclick=()=>{ navigator.clipboard.writeText(location.origin+location.pathname+'#/'); toast('Link copied'); };
      return;
    }
  }
};
// === Seating layout hook and rendering ===
(function(){
  const origRender = Game.render ? Game.render.bind(Game) : null;
  Game.render = function(forceFull){
    if (origRender) origRender(forceFull);
    try{ this.renderSeating(forceFull); }catch(e){ /* no-op */ }
  };
  Game.renderSeating = function(forceFull){
    const s=this.state;
    const $ = (sel)=>document.querySelector(sel);
    const main = $('#mainCard');
    if (!main) return;

    // Hide old participant lists if present
    const old1 = $('#msPlist'); if (old1) old1.style.display='none';
    const old2 = $('#msPlistRun'); if (old2) old2.style.display='none';

    // Ensure stage container with left seats, card wrap, right seats
    let stage = $('#msStageRow');
    if (!stage){
      stage = document.createElement('div');
      stage.id='msStageRow';
      stage.style.display='flex';
      stage.style.alignItems='center';
      stage.style.justifyContent='center';
      stage.style.gap='16px';
      stage.style.width='100%';
      const left = document.createElement('div'); left.id='msSeatsLeft';
      const center = document.createElement('div'); center.id='msCardWrap';
      const right = document.createElement('div'); right.id='msSeatsRight';
      for (const col of [left,right]){
        col.style.width='140px';
        col.style.display='flex';
        col.style.flexDirection='column';
        col.style.justifyContent='space-between';
        col.style.gap='8px';
      }
      center.style.display='flex';
      center.style.alignItems='center';
      center.style.justifyContent='center';

      // Insert stage into DOM and move the question block inside the center
      const q = $('#msQ');
      if (q && q.parentElement === main){
        main.replaceChild(stage, q);
        stage.appendChild(left); stage.appendChild(center); stage.appendChild(right);
        center.appendChild(q);
      }else{
        // Append once
        if (!$('#msSeatsLeft')){
          stage.appendChild(left); stage.appendChild(center); stage.appendChild(right);
          main.appendChild(stage);
        }
        const q2 = $('#msQ');
        if (q2 && q2.parentElement !== center){
          center.appendChild(q2);
        }
      }
    }

    // Size the question block to 220x260 on desktop and proportional on mobile
    const q = $('#msQ');
    if (q){
      q.style.aspectRatio='220 / 260';
      q.style.width='clamp(180px, 60vw, 220px)';
      q.style.margin='0';
    }

    const left = $('#msSeatsLeft');
    const right = $('#msSeatsRight');
    if (!left || !right) return;

    // Helpers
    function labelBase(){
      const div = document.createElement('div');
      div.className = 'msSeat';
      div.style.fontSize='clamp(11px, 1.6vw, 12px)';
      div.style.lineHeight='1.2';
      div.style.opacity='0.95';
      div.style.whiteSpace='nowrap';
      div.style.overflow='hidden';
      div.style.textOverflow='ellipsis';
      return div;
    }
    function labelLeft(p, highlight){
      const el = labelBase();
      el.style.textAlign='right';
      el.style.padding='2px 4px 2px 0';
      el.textContent = p.display_name || p.name || p.nickname || ('Player '+(p.id||''));
      if (highlight) el.style.opacity='1';
      return el;
    }
    function labelRight(p, highlight){
      const el = labelBase();
      el.style.textAlign='left';
      el.style.padding='2px 0 2px 4px';
      el.textContent = p.display_name || p.name || p.nickname || ('Player '+(p.id||''));
      if (highlight) el.style.opacity='1';
      return el;
    }

    // Build ordered seats: host first, then guests in join order, cap at 8
    const parts = Array.isArray(s.participants)? s.participants.slice() : [];
    if (!parts.length){ left.innerHTML=''; right.innerHTML=''; return; }
    const hostUid = s.host_user_id ? String(s.host_user_id) : null;
    let host = null;
    for (const p of parts){
      const uid = String(p.user_id||p.auth_user_id||p.owner_id||'');
      if (hostUid && uid === hostUid){ host = p; break; }
    }
    if (!host) host = parts[0];
    const guests = parts.filter(p => p !== host);
    const ordered = [host, ...guests].slice(0,8);

    // Split indices: left 0,2,4,6 and right 1,3,5,7
    const leftIdx = new Set([0,2,4,6]);
    const rightIdx = new Set([1,3,5,7]);
    const leftItems = []; const rightItems = [];
    ordered.forEach((p,i)=>{ (leftIdx.has(i)? leftItems : rightItems).push(p); });

    // Equal height distribution: always render 4 rows with space-between, pad with spacers
    function fill(col, items, rightSide){
      col.innerHTML='';
      col.style.minHeight = '260px';
      col.style.height = 'clamp(212px, 60vw, 260px)';
      col.style.justifyContent = 'space-between';
      for (let i=0;i<items.length;i++){
        const p = items[i];
        const isCur = String(s.current_turn?.participant_id||'') === String(p.id||p.participant_id||'');
        const node = rightSide? labelRight(p, isCur) : labelLeft(p, isCur);
        col.appendChild(node);
      }
      for (let i=items.length; i<4; i++){
        const spacer = document.createElement('div');
        spacer.style.height='1px';
        spacer.style.visibility='hidden';
        col.appendChild(spacer);
      }
    }
    fill(left, leftItems, false);
    fill(right, rightItems, true);
  };
})();

export async function render(ctx){
  const code = ctx?.code || null;
  const app=document.getElementById('app');
  app.innerHTML=
    '<div class=\"offline-banner\">You are offline. Trying to reconnect…</div>'+
    '<div class=\"room-wrap\">'+
      '<div class=\"controls-row\" id=\"controlsRow\"></div>'+
      '<div id=\"roomMain\" style=\"display:grid;grid-template-columns:1fr auto 1fr;column-gap:12px;align-items:flex-start;justify-items:center;width:100%;\">'+
        '<div id=\"sideLeft\" style=\"min-width:220px;justify-self:end;\"></div>'+
        '<div class=\"card main-card\" id=\"mainCard\" style=\"width:220px;max-width:220px;position:relative;\"></div>'+
      '</div>'+
      '<div class=\"controls-row\" id=\"toolsRow\"></div>'+
      '<div class=\"answer-row\" id=\"answerRow\"></div>'+
    '</div>';
  await renderHeader(); ensureDebugTray();
  try{ document.body.classList.add('is-game'); }catch{}
  const _ms_onHash = () => { if (!location.hash.startsWith('#/game/')) { try{ document.body.classList.remove('is-game'); }catch{} window.removeEventListener('hashchange', _ms_onHash); } };
  window.addEventListener('hashchange', _ms_onHash);
if (code){ Game.mount(code); }
}
