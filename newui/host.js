// host.js
import { API, getSession, msGidKey, msPidKey, msRoleKey, hostMarkerKey } from './api.js';
import { renderHeader, ensureDebugTray, $, toast, shareRoom, participantsListHTML } from './ui.js';
import { inferAndPersistHostRole } from './api.js';

function clearRememberedRoom(code){
  try{
    // Clear generic active room
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
      <div class="card">
        <div class="host-head"><h2>Host a game</h2></div>
        <div id="hostControls"></div>
      </div>
    </div>`;
  await renderHeader(); ensureDebugTray();

  const el=$('#hostControls');

  function renderCreateUI(){
    el.innerHTML = `
      <div class="grid">
        <button class="primary" id="createGame">Create Game</button>
        <p class="help">You will receive a game code and a room for players to join.</p>
      </div>`;
    $('#createGame').onclick=btnCreateGame;
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
      <div class="grid">
        <div class="inline-actions">
          <span class="help">Code: <strong class="code-value">${code}</strong></span>
          <button class="icon-btn" id="copyCode" title="Copy code"><img src="./assets/copy.png" alt="copy"/></button>
          <button class="ghost" id="shareInvite">Share invite</button>
          <button class="primary" id="goRoom">Go to room</button>
        </div>
        <div class="help">Status: <strong>${phase}</strong> • Players: ${players.length}</div>
        <div>${participantsListHTML(players, curPid)}</div>
      </div>`;

    $('#goRoom').onclick=()=>{ try{ sessionStorage.setItem(hostMarkerKey(code), '1'); }catch{} location.hash='#/game/'+code; };
    $('#copyCode').onclick=()=>{ navigator.clipboard.writeText(code).then(()=>toast('Code copied')).catch(()=>toast('Copy failed')); };
    $('#shareInvite').onclick=()=>shareRoom(code);
  }

  async function btnCreateGame(){
    try{
      const data = await API.create_game();
      const code = data?.code || data?.game_code;
      const gid  = data?.id || data?.game_id;
      if (!code || !gid){ toast('Created, but missing code/id'); return; }
      try{ sessionStorage.setItem(hostMarkerKey(code), '1'); }catch{}
      await renderExisting(code);
    }catch(e){
      toast(e.message||'Failed to create');
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
