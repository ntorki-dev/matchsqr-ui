// join.js
import { API } from './api.js';
import { renderHeader, ensureDebugTray, $, toast } from './ui.js';

export async function render(){
  const app=document.getElementById('app');
  app.innerHTML = `
    <div class="offline-banner">You are offline. Trying to reconnect…</div>
    <div class="container">
      <div style="max-width:420px;margin:28px auto;">
        <h2>Join a game</h2>
        <div class="grid">
          <input id="gameId" class="input" placeholder="Game code">
          <input id="nickname" class="input" placeholder="Nickname">
          <button id="joinBtn" class="btn" style="margin-top:8px;">Join</button>
        </div>
      </div>
    </div>`;
  await renderHeader(); ensureDebugTray();
  $('#joinBtn').onclick=async()=>{
    const code=$('#gameId').value.trim(); const nickname=$('#nickname').value.trim();
    if (!code) return toast('Enter game code');
    if (!nickname) return toast('Enter nickname');
    try{
      await API.join_game_guest({ code, nickname });
      try{ localStorage.setItem(`ms_nick_${code}`, nickname); }catch{}
      location.hash='#/game/'+code;
    }
    catch(e){ toast(e.message||'Failed to join'); }
  };
}
