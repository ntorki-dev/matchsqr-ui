// host.js
import { API, getSession, msGidKey, msPidKey, msRoleKey, hostMarkerKey } from './api.js';
import { renderHeader, ensureDebugTray, $, toast, shareRoom, participantsListHTML } from './ui.js';
import { inferAndPersistHostRole } from './api.js';

function clearRememberedRoom(code){
  try{
    localStorage.removeItem('active_room');
    sessionStorage.removeItem('active_room');
  }catch{}
  try{
    if (code){
      localStorage.removeItem(msGidKey(code));
      localStorage.removeItem(msPidKey(code));
      localStorage.removeItem(msRoleKey(code));
      sessionStorage.removeItem(hostMarkerKey(code));
    }
  }catch{}
}

export async function render(){
  const session = await getSession();
  if (!session){ sessionStorage.setItem('__redirect_after_login', '#/host'); location.hash = '#/login'; return; }
  const app=document.getElementById('app');
  app.innerHTML = `
    <div class="offline-banner">You are offline. Trying to reconnect…</div>
    <div class="host-wrap">
      <div id="hostControls"></div>
    </div>`;
  await renderHeader(); ensureDebugTray();

  const el=$('#hostControls');

  function renderCreateUI(){
  el.innerHTML = `
    <div class="grid host-create host-center">
      <p class="host-lead">Get Ready.<br/>You might be surprised!</p>
      <button class="cta" id="createGame">
        <img src="./assets/crown.png" alt="crown"/>
        <span>Create Game</span>
      </button>
    </div>
  `;
  $('#createGame').onclick = btnCreateGame;
}


  async function renderExisting(code){
  // Always verify with server before showing any existing code
  let state=null;
  try{
    state = await API.get_state({ code });
  }catch(e){
    // Not found or any error, treat as stale
    clearRememberedRoom(code);
    renderCreateUI();
    return;
  }

  const phase = (state?.status || state?.phase || 'lobby');
  // If the game is ended or closed, clear and fallback
  if (phase === 'ended'){
    clearRememberedRoom(code);
    renderCreateUI();
    return;
  }

  const players = Array.isArray(state?.participants||state?.players) ? (state.participants||state.players) : [];
  const curPid = state?.current_turn?.participant_id || null;
  const gid = state?.game_id || state?.id || null;
  if (gid) try{ localStorage.setItem(msGidKey(code), JSON.stringify(gid)); }catch{}

  await inferAndPersistHostRole(code, state);

  el.innerHTML = `
    <div class="grid host-existing host-center">
      <button class="cta" id="goRoom">
        <img src="./assets/play.png" alt="play"/>
        <span>Go to Room</span>
      </button>

      <div class="code-share-col">
        <div class="id-line">
          <span class="help lead-help">Your Game ID is:</span>
          <span class="code-blob"><strong class="code-value">${code}</strong></span>
          <button class="icon-btn" id="copyCode" title="Copy code"><img src="./assets/copy.png" alt="copy"/></button>
        </div>
        <div class="share-line">
          <span class="help">You can share this game ID with other players</span>
          <button class="icon-btn" id="shareInvite" title="Share link"><img src="./assets/share.png" alt="share"/></button>
        </div>
      </div>
    </div>
  `;

  $('#goRoom').onclick=()=>{ try{ sessionStorage.setItem(hostMarkerKey(code), '1'); }catch{} location.hash='#/game/'+code; };

  const joinUrl = `${location.origin}${location.pathname}#/join?gameCode=${code}`;
  $('#copyCode').onclick = () => { navigator.clipboard.writeText(code).then(()=>toast('Code copied')).catch(()=>toast('Copy failed')); };
  $('#shareInvite').onclick = async () => {
  const joinUrl = `${location.origin}${location.pathname}#/join?gameCode=${code}`;
  if (navigator.share){
    try{
      await navigator.share({ title: 'Join my game', text: `Game ID: ${code}`, url: joinUrl });
      return;
    }catch{}
  }
  try{
    await navigator.clipboard.writeText(joinUrl);
    toast('Join link copied');
  }catch{
    toast('Unable to share');
  }
};
}

    async function btnCreateGame(){
    try{
      // 1) Check entitlements before creating a game
      let check;
      try{
        check = await API.entitlement_check({ action: 'allow_create_game' });
      }catch(e){
        toast(e?.message || 'Unable to check game entitlement');
        return;
      }

      if (!check || check.can_proceed !== true){
        const reason = check?.reason || '';
        const remaining = typeof check?.remaining_seconds === 'number' ? check.remaining_seconds : null;

        if (reason === 'free_window_not_elapsed' && remaining != null){
          // Convert remaining seconds into a readable message
          const totalMinutes = Math.ceil(remaining / 60);
          const days = Math.floor(totalMinutes / (60 * 24));
          const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
          const minutes = totalMinutes % 60;
          const parts = [];
          if (days > 0) parts.push(days + ' day' + (days > 1 ? 's' : ''));
          if (hours > 0) parts.push(hours + ' hour' + (hours > 1 ? 's' : ''));
          if (minutes > 0 || parts.length === 0) parts.push(minutes + ' minute' + (minutes !== 1 ? 's' : ''));

          toast('You can start another free game in ' + parts.join(' ') + '.');
        } else {
          toast('You cannot create a new game right now.');
        }

        // Send host to billing to buy extra weekly game or subscribe
        location.hash = '#/billing?from=create';
        return;
      }

      // 2) Entitlement allows game creation, proceed as before
      const data = await API.create_game();
      const code = data?.code || data?.game_code;
      const gid  = data?.id || data?.game_id;
      if (!code || !gid){ toast('Created, but missing code/id'); return; }

      try{ sessionStorage.setItem(hostMarkerKey(code), '1'); }catch{}
      // Persist host participant_id when provided by API, to enable answering on host turn
      try{
        const pid = data?.participant_id || data?.host_participant_id || null;
        if (pid) localStorage.setItem(msPidKey(code), JSON.stringify(pid));
      }catch{}
      await renderExisting(code);

    }catch(e){
      if (e && e.status === 409){
        try{
          const c = e?.data?.code || e?.data?.game_code || e?.data?.room_code || e?.data?.active_code || (e?.data?.data && (e.data.data.code||e.data.data.game_code));
          if (c){ await renderExisting(c); return; }
        }catch(_){}
        toast('You already have an active game.');
        return;
      }
      toast(e?.message||'Failed to create');
      renderCreateUI();
    }
  }


  // Prefill from remembered room, but only show it if server confirms it's lobby or running
  const arRaw = localStorage.getItem('active_room') || sessionStorage.getItem('active_room');
  let ar; try{ ar = JSON.parse(arRaw||'null'); }catch{ ar=null; }
  const rememberedCode = ar && (ar.code || ar.game_code);

  if (rememberedCode){
    await renderExisting(rememberedCode);
  } else {
    renderCreateUI();
  }
}
