// join.js
import { API, getSession } from './api.js';
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

  // Support shared URLs like /#/join?gameCode=KE9DJY
  try{
    const h = location.hash || "";
    const m = h.match(/[?&]gameCode=([^&]+)/i);
    if (m && codeInput){
      const v = decodeURIComponent(m[1] || "").trim().toUpperCase();
      if (v) codeInput.value = v;
    }
  }catch{}

  // Prefill nickname using same logic as game.js
  try{
    let display = null;
    try {
      // game.js tries __msGetCachedUser first
      // eslint-disable-next-line no-undef
      const cached = (typeof __msGetCachedUser === 'function') ? __msGetCachedUser() : null;
      if (cached) {
        display = (cached?.user_metadata?.name) || (cached?.name) || null;
      }
    } catch(_){}

    if (!display) {
      const sess = await getSession();
      const user = sess?.user || null;
      if (user) {
        // match game.js preference, no email alias fallback
        display = (user?.user_metadata?.name) || (user?.user_metadata?.full_name) || (user?.name) || null;
      }
    }
    if (display && nickInput && !nickInput.value) {
      nickInput.value = String(display);
    }
  }catch{}

  // Uppercase normalization for backend + redirect, with UX while typing/paste
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

  joinBtn.onclick=async()=>{
    const rawCode=(codeInput?.value||'').trim();
    const nickname=(nickInput?.value||'').trim();
    if (!rawCode) return toast('Enter game code');
    if (!nickname) return toast('Enter nickname');
    const code = rawCode.toUpperCase(); // canonical for backend + redirect
    try{
      await API.join_game_guest({ code, nickname });
      try{ localStorage.setItem(`ms_nick_${code}`, nickname); }catch{}
      location.hash = '#/game/' + code; // canonical uppercase URL
    }
    catch(e){ toast(e.message||'Failed to join'); }
  };
}
