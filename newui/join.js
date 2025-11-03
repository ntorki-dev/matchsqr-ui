// join.js
import { API, getSession, getProfileName } from './api.js';
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

  const codeInput = $('#gameId');
  const nickInput = $('#nickname');
  const joinBtn = $('#joinBtn');

  // Capture shared URLs like /#/join?gameCode=KE9DJY and prefill
  try{
    const h = location.hash || "";
    const m = h.match(/[?&]gameCode=([^&]+)/i);
    if (m && codeInput){
      const v = decodeURIComponent(m[1] || "").trim().toUpperCase();
      if (v) codeInput.value = v;
    }
  }catch{}

  // Prefill nickname EXACTLY like account.js: getProfileName -> user_metadata.name -> email alias
  try{
    const session = await getSession();
    const user = session?.user || null;
    if (user && nickInput && !nickInput.value){
      let name = await getProfileName(user.id);
      if (!name) name = user?.user_metadata?.name || null;
      if (!name && user?.email) name = user.email.split('@')[0];
      if (name) nickInput.value = String(name);
    }
  }catch{}

  // Uppercase UX while typing and on paste
  if (codeInput){
    codeInput.addEventListener('input', () => {
      const start = codeInput.selectionStart, end = codeInput.selectionEnd;
      codeInput.value = (codeInput.value || "").toUpperCase();
      if (start != null && end != null) codeInput.setSelectionRange(start, end);
    });
    codeInput.addEventListener('paste', (e) => {
      try{
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text') || '';
        const up = text.toUpperCase();
        const s = codeInput.selectionStart ?? codeInput.value.length;
        const t = codeInput.selectionEnd ?? codeInput.value.length;
        codeInput.setRangeText(up, s, t, 'end');
      }catch{}
    });
  }

  // Submit: uppercase for backend and redirect
  joinBtn.onclick=async()=>{
    const rawCode=(codeInput?.value||'').trim();
    const nickname=(nickInput?.value||'').trim();
    if (!rawCode) return toast('Enter game code');
    if (!nickname) return toast('Enter nickname');
    const code = rawCode.toUpperCase();
    try{
      await API.join_game_guest({ code, nickname });
      try{ localStorage.setItem(`ms_nick_${code}`, nickname); }catch{}
      location.hash = '#/game/' + code;
    }
    catch(e){ toast(e.message||'Failed to join'); }
  };
}
