// account.js
import { ensureClient, getSession } from './api.js';
import { renderHeader, ensureDebugTray, $, toast } from './ui.js';

export async function render(ctx){
  const tab = ctx?.tab || 'account';
  if (tab === 'login') return renderLogin();

  const app = document.getElementById('app');
  // Confirm real session before rendering protected UI
  const session = await getSession();
  const user = session?.user || null;
  if (!user) {
    try { sessionStorage.setItem('__redirect_after_login', '#/account'); } catch (_) {}
    location.hash = '#/login';
    // Render a tiny message as a fallback in case routing is delayed
    app.innerHTML = `
      <div class="offline-banner">You are offline. Trying to reconnect…</div>
      <div class="container">
        <div class="card" style="max-width:520px;margin:28px auto;">
          <h2>Account</h2>
          <p>You need to log in to view your account.</p>
          <p><a class="btn btn-primary" href="#/login?next=%2F#%2Faccount">Go to Login</a></p>
        </div>
      </div>`;
    await renderHeader(); ensureDebugTray();
    return;
  }

  const name = user?.user_metadata?.name || (user?.email ? user.email.split('@')[0] : 'Account');
  app.innerHTML = `
    <div class="offline-banner">You are offline. Trying to reconnect…</div>
    <div class="container">
      <div class="card" style="max-width:720px;margin:28px auto;">
        <h2>Welcome, ${name}</h2>
        <div class="grid" style="grid-template-columns:1fr 1fr; gap:12px">
          <button id="logoutBtn" class="ghost">Logout</button>
        </div>
      </div>
    </div>`;
  await renderHeader(); ensureDebugTray();
  $('#logoutBtn').onclick = async () => {
    try {
      const sb = await ensureClient();
      await sb.auth.signOut();
    } catch (_) {}
    try { localStorage.removeItem('ms_lastKnownUser'); } catch (_) {}
    location.hash = '#/';
  };
}

async function renderLogin(){
  const app=document.getElementById('app');
  const redirectTo = sessionStorage.getItem('__redirect_after_login') || '#/';
  app.innerHTML = `
    <div class="offline-banner">You are offline. Trying to reconnect…</div>
    <div class="container">
      <div class="card" style="max-width:520px;margin:28px auto;">
        <h2>Login</h2>
        <div class="grid">
          <input id="email" class="input" placeholder="Email" type="email">
          <input id="password" class="input" placeholder="Password" type="password">
          <label><input id="remember" type="checkbox"> Remember me</label>
          <button id="loginBtn" class="btn">Login</button>
          <div style="display:flex;gap:10px;justify-content:space-between;">
            <a class="help" href="#/account">Account</a>
            <a class="help" href="#/help">Help</a>
          </div>
        </div>
      </div>
    </div>`;
  await renderHeader(); ensureDebugTray();
  $('#loginBtn').onclick=async()=>{
    try{
      const sb = await ensureClient();
      const { error } = await sb.auth.signInWithPassword({ email:$('#email').value.trim(), password:$('#password').value });
      if (error) throw error;
      const remember = !!$('#remember').checked;
      (remember?localStorage:sessionStorage).setItem('remember_me', JSON.stringify(remember));
      location.hash = redirectTo;
      sessionStorage.removeItem('__redirect_after_login');
    }catch(e){ toast(e.message||'Login failed'); }
  };
}
