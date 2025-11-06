// account.js
import { ensureClient, getSession, getProfileName } from './api.js';
import { renderHeader, ensureDebugTray, $, toast } from './ui.js';

/** Attach a previously stored guest session to the current authenticated user.
 * Option B flow: another screen stores { game_id, temp_player_id } in localStorage
 *   localStorage.setItem('ms_attach_payload', JSON.stringify({ game_id, temp_player_id }))
 * We call this AFTER a successful login or when rendering #/account.
 */
async function attachGuestIfPending(sb) {
  try {
    const raw = localStorage.getItem('ms_attach_payload');
    if (!raw) return false;
    const payload = JSON.parse(raw);
    if (!payload?.game_id || !payload?.temp_player_id) return false;

    // Must be authenticated
    const { data: session } = await sb.auth.getSession();
    if (!session?.session?.user) return false;

    const { error } = await sb.functions.invoke('convert_guest_to_user', {
      body: { game_id: payload.game_id, temp_player_id: payload.temp_player_id },
    });
    if (error) {
      console.warn('convert_guest_to_user error', error);
      toast('We could not attach your previous session automatically.');
      return false;
    }

    // Success: clear payload and notify once
    localStorage.removeItem('ms_attach_payload');
    toast('Your previous session was attached to your account.');
    return true;
  } catch (e) {
    console.warn('attachGuestIfPending failed', e);
    return false;
  }
}

export async function render(ctx){
  const tab = ctx?.tab || 'account';
  if (tab === 'login') return renderLogin();
  if (tab === 'register') return renderRegister();

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
        <div style="max-width:520px;margin:28px auto;">
          <h2>Account</h2>
          <p>You need to log in to view your account.</p>
          <p><a class="btn btn-primary" href="#/login?next=%2F#%2Faccount">Go to Login</a></p>
        </div>
      </div>`;
    await renderHeader(); ensureDebugTray();
    return;
  }

  const dbName = await getProfileName(user.id);
  const name = dbName || user?.user_metadata?.name || (user?.email ? user.email.split('@')[0] : 'Account');
  app.innerHTML = `
    <div class="offline-banner">You are offline. Trying to reconnect…</div>
    <div class="container">
      <div style="max-width:720px;margin:28px auto;">
        <h2>Welcome, ${name}</h2>
        <p class="muted" id="attach-status" style="display:none;"></p>
        <div class="grid" style="grid-template-columns:1fr 1fr; gap:12px">
          <button id="logoutBtn" class="ghost">Logout</button>
        </div>
      </div>
    </div>`;
  await renderHeader(); ensureDebugTray();

  // Option B hook: try to attach guest payload if present
  try {
    const sb = await ensureClient();
    await attachGuestIfPending(sb);
  } catch {}

  $('#logoutBtn').onclick = async () => {
    try {
      const sb = await ensureClient();
      await sb.auth.signOut();
    } catch (_) {}
    // Clear client caches and remember flags so header updates immediately
    try{
      localStorage.removeItem('ms_lastKnownUser');
      localStorage.removeItem('remember_me');
      sessionStorage.removeItem('remember_me');
      sessionStorage.removeItem('__redirect_after_login');
    }catch{}
    // Re-render header and route to login for a clean state (helps on mobile)
    try{ await renderHeader(); }catch{}
    location.hash = '#/login';
  };
}

async function renderLogin(){
  const app=document.getElementById('app');
  const redirectTo = sessionStorage.getItem('__redirect_after_login') || '#/';
  app.innerHTML = `
    <div class="offline-banner">You are offline. Trying to reconnect…</div>
    <div class="container">
      <div style="max-width:520px;margin:28px auto;">
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

      // Option B hook: try to attach guest payload if present after login
      await attachGuestIfPending(sb);

      location.hash = redirectTo;
      sessionStorage.removeItem('__redirect_after_login');
    }catch(e){ toast(e.message||'Login failed'); }
  };
}

async function renderRegister(){
  const app = document.getElementById('app');
  const redirectAfter = '#/account';
  app.innerHTML = `
    <div class="offline-banner">You are offline. Trying to reconnect…</div>
    <div class="container">
      <div style="max-width:720px;margin:28px auto;">
        <h2>Hey, happy to see you!</h2>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label class="muted">Create a new account</label>
            <input id="reg_name" class="input" placeholder="Name" autocomplete="name">
            <div style="display:flex;align-items:center;gap:16px;margin:6px 0 2px;">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="radio" name="reg_gender" id="reg_gender_male" value="male">
                <span>Male</span>
              </label>
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="radio" name="reg_gender" id="reg_gender_female" value="female">
                <span>Female</span>
              </label>
            </div>
            <input id="reg_email" class="input" placeholder="Email" type="email" autocomplete="email">
          </div>
          <div>
            <label class="muted">I have an account</label>
            <input id="reg_dob" class="input" placeholder="Date of birth" type="date">
            <small class="muted">Format helper: DD-MM-YYYY (we convert on submit)</small>
            <input id="reg_password" class="input" placeholder="Password" type="password" autocomplete="new-password">
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:10px;">
          <input id="reg_consent" type="checkbox">
          <span>I agree to the Terms and Privacy Policy</span>
        </label>
        <div style="margin-top:12px;">
          <button id="reg_submit" class="btn">Submit</button>
          <a href="#/login" class="link" style="margin-left:12px;">Already have an account? Login</a>
        </div>
        <div id="reg_msg" class="muted" style="margin-top:10px;"></div>
      </div>
    </div>`;
  await renderHeader(); ensureDebugTray();

  function computeAge(isoDate){
    try{
      const d = new Date(isoDate);
      const today = new Date();
      let age = today.getFullYear() - d.getFullYear();
      const m = today.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
      return age;
    }catch(_){ return NaN; }
  }

  $('#reg_submit').onclick = async () => {
    try{
      const name = ($('#reg_name')?.value||'').trim();
      const genderUi = (document.querySelector('input[name=reg_gender]:checked')||{}).value || '';
      const gender = genderUi === 'male' ? 'man' : (genderUi === 'female' ? 'woman' : null);
      const email = ($('#reg_email')?.value||'').trim();
      const password = $('#reg_password')?.value||'';
      const dobISO = ($('#reg_dob')?.value||'').trim(); // native date input gives yyyy-mm-dd

      if (!name) throw new Error('Please enter your name.');
      if (!gender) throw new Error('Please select Male or Female.');
      if (!dobISO) throw new Error('Please select your date of birth.');
      const age = computeAge(dobISO);
      if (!(age >= 12 && age <= 100)) throw new Error('Your age must be between 12 and 100.');
      if (!email) throw new Error('Please enter your email.');
      if (!password || password.length < 6) throw new Error('Please choose a password (min 6 chars).');
      if (!$('#reg_consent').checked) throw new Error('Please accept the Terms and Privacy Policy.');

      const sb = await ensureClient();
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: { name, birthdate: dobISO, gender },
          emailRedirectTo: location.origin + '/#/account'
        }
      });
      if (error) throw error;

      $('#reg_submit').disabled = true;
      const msg = (data?.user && !data?.session)
        ? 'We have sent you a confirmation email. Please confirm to access your account.'
        : 'Registration successful. Redirecting...';
      $('#reg_msg').textContent = msg;

      if (data?.session) {
        // If confirmation is disabled and we already have a session,
        // attempt Option B attach immediately, then go to account.
        await attachGuestIfPending(sb);
        location.hash = redirectAfter;
      }
    }catch(e){
      toast(e.message || 'Registration failed');
    }
  };
}
