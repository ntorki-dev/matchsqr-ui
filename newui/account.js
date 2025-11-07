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

/** Show a Resend Confirmation inline control with cooldown.
 * Appears only when login fails with an "email not confirmed" error,
 * or after signUp returns no session on Register.
 */
function showResendControl({ container, email }) {
  // Reuse existing styles: .help for small link, .btn for button, .muted for text
  let row = container.querySelector('#resendRow');
  if (!row) {
    row = document.createElement('div');
    row.id = 'resendRow';
    row.style.marginTop = '10px';
    row.innerHTML = `
      <button id="resendBtn" class="btn">Resend confirmation email</button>
      <span id="resendMsg" class="muted" style="margin-left:8px;"></span>
    `;
    container.appendChild(row);
  }
  const btn = row.querySelector('#resendBtn');
  const msg = row.querySelector('#resendMsg');
  btn.disabled = false;
  msg.textContent = '';

  let cooldown = null;
  const startCooldown = (secs=60) => {
    let left = secs;
    btn.disabled = true;
    const tick = () => {
      if (left <= 0) {
        btn.disabled = false;
        msg.textContent = '';
        cooldown && clearInterval(cooldown);
        cooldown = null;
        return;
      }
      msg.textContent = `Email sent. You can resend in ${left}s.`;
      left -= 1;
    };
    tick();
    cooldown = setInterval(tick, 1000);
  };

  btn.onclick = async () => {
    try {
      const sb = await ensureClient();
      await sb.auth.resend({
        type: 'signup',
        email: email,
        options: { emailRedirectTo: location.origin + '/#/account' }
      });
      startCooldown(60);
    } catch (e) {
      toast('Could not resend right now. Please try again soon.');
    }
  };
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
          <p><a class="btn" href="#/login?next=%2F#%2Faccount">Go to Login</a></p>
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
    try{
      localStorage.removeItem('ms_lastKnownUser');
      localStorage.removeItem('remember_me');
      sessionStorage.removeItem('remember_me');
      sessionStorage.removeItem('__redirect_after_login');
    }catch{}
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
        <div id="loginCard" class="grid">
          <input id="email" class="input" placeholder="Email" type="email" autocomplete="email">
          <input id="password" class="input" placeholder="Password" type="password" autocomplete="current-password">
          <label class="muted"><input id="remember" type="checkbox"> Remember me</label>
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
    const email = $('#email').value.trim();
    const password = $('#password').value;
    try{
      const sb = await ensureClient();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = ('' + (error?.message || '')).toLowerCase();
        // Detect unconfirmed email message heuristically
        if (msg.includes('confirm') || msg.includes('verified')) {
          showResendControl({ container: $('#loginCard'), email });
        }
        throw error;
      }

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
        <h2 style="text-align:center;font-size:clamp(24px,4vw,40px);font-weight:800;margin:0 0 16px;">Hey, happy to see you!</h2>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label class="help" style="color:#22a447;font-weight:700;">Create a new account</label>
            <input id="reg_name" class="input" placeholder="Name" autocomplete="name">
            <div style="display:flex;align-items:center;gap:16px;margin:10px 0 10px;">
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
            <a href="#/login" class="help" style="text-decoration:underline;">I have an account</a>
            <input id="reg_dob" class="input" placeholder="Date of birth" type="date">
            <input id="reg_password" class="input" placeholder="Password" type="password" autocomplete="new-password">
          </div>
        </div>

        <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
          <label class="muted" style="display:flex;align-items:center;gap:8px;">
            <input id="reg_consent_tc" type="checkbox">
            <span>I agree to the <a class="help" href="#/terms" style="text-decoration:underline;">Terms and Conditions</a></span>
          </label>
          <label class="muted" style="display:flex;align-items:center;gap:8px;">
            <input id="reg_consent_privacy" type="checkbox">
            <span>I consent to the processing of my personal data according to the <a class="help" href="#/privacy" style="text-decoration:underline;">Privacy Notice</a></span>
          </label>
        </div>

        <div style="margin-top:12px;">
          <button id="reg_submit" class="btn">Submit</button>
        </div>
        <div id="reg_msg" class="muted" style="margin-top:10px;"></div>
        <div id="resendWrap" class="muted" style="margin-top:6px;"></div>
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
    const name = ($('#reg_name')?.value||'').trim();
    const genderUi = (document.querySelector('input[name=reg_gender]:checked')||{}).value || '';
    const gender = genderUi === 'male' ? 'man' : (genderUi === 'female' ? 'woman' : null);
    const email = ($('#reg_email')?.value||'').trim();
    const password = $('#reg_password')?.value||'';
    const dobISO = ($('#reg_dob')?.value||'').trim(); // native date input gives yyyy-mm-dd

    try{
      if (!name) throw new Error('Please enter your name.');
      if (!gender) throw new Error('Please select Male or Female.');
      if (!dobISO) throw new Error('Please select your date of birth.');
      const age = computeAge(dobISO);
      if (!(age >= 12 && age <= 100)) throw new Error('Your age must be between 12 and 100.');
      if (!email) throw new Error('Please enter your email.');
      if (!password || password.length < 6) throw new Error('Please choose a password (min 6 chars).');
      if (!$('#reg_consent_tc').checked) throw new Error('Please accept the Terms and Conditions.');
      if (!$('#reg_consent_privacy').checked) throw new Error('Please accept the Privacy Notice.');

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
      const needsConfirm = (!!data?.user && !data?.session);
      if (needsConfirm) {
        $('#reg_msg').textContent = 'Check your email to confirm your account.';
        // Show resend control on Register too (as requested)
        showResendControl({ container: $('#resendWrap'), email });
      } else {
        $('#reg_msg').textContent = 'Registration successful. Redirecting...';
        await attachGuestIfPending(sb);
        location.hash = redirectAfter;
      }
    }catch(e){
      toast(e.message || 'Registration failed');
    }
  };
}
