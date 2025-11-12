// account.js
import { ensureClient, getSession, getProfileName } from './api.js';
import { renderHeader, ensureDebugTray, $, toast } from './ui.js';

/* ------------------------------- Path-safe base ------------------------------ */
const BASE = (location.href.split('#')[0] || '').replace(/index\.html?$/,''); 
const URL_ACCOUNT = `${BASE}#/account`;
const URL_RESET   = `${BASE}#/reset`;   // CHANGED to dedicated route

/* -------------------------------- Utilities -------------------------------- */

function parseHashQuery() {
  const h = location.hash || "";
  const i = h.indexOf("?");
  if (i === -1) return {};
  const p = new URLSearchParams(h.substring(i + 1));
  const o = {}; for (const [k, v] of p.entries()) o[k] = v; return o;
}

async function attachGuestIfPending(sb) {
  try {
    const raw = localStorage.getItem('ms_attach_payload');
    if (!raw) return false;

    const payload = JSON.parse(raw || 'null');
    if (!payload || !payload.game_id || !payload.temp_player_id) return false;

    // Wait up to ~3s for a real session after login/signup
    const start = Date.now();
    let sessionUser = null;
    do {
      const { data } = await sb.auth.getSession();
      sessionUser = data?.session?.user || null;
      if (sessionUser) break;
      await new Promise(r => setTimeout(r, 150));
    } while (Date.now() - start < 3000);

    if (!sessionUser) {
      console.warn('attachGuestIfPending: no session yet, skip');
      return false;
    }

    // Basic UUID sanity check
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(String(payload.game_id)) || !UUID_RE.test(String(payload.temp_player_id))) {
      console.warn('attachGuestIfPending: payload not UUIDs', payload);
      return false;
    }

    const { error } = await sb.functions.invoke('convert_guest_to_user', { body: payload });
    if (error) {
      console.warn('convert_guest_to_user error', error);
      // keep ms_attach_payload so user can retry from Account
      return false;
    }

    // Success
    try { localStorage.removeItem('ms_attach_payload'); } catch {}
    return true;
  } catch (e) {
    console.warn('attachGuestIfPending failed', e);
    return false;
  }
}


function computeAge(isoDate){
  try{ const d=new Date(isoDate), t=new Date(); let a=t.getFullYear()-d.getFullYear(); const m=t.getMonth()-d.getMonth(); if(m<0||(m===0&&t.getDate()<d.getDate())) a--; return a; }catch{ return NaN; }
}

/* ----------------------------- Resend confirmation ----------------------------- */

function mountResendControls(container, email) {
  container.innerHTML = `
    <div class="controls-row">
      <button id="resendBtn" class="btn">Resend confirmation email</button>
    </div>
    <p id="resendMsg" class="help" style="text-align:center;"></p>
  `;
  const btn = container.querySelector('#resendBtn');
  const msg = container.querySelector('#resendMsg');

  let timer = null, left = 0;
  const startCooldown = (secs=60) => {
    left = secs;
    btn.disabled = true;
    const tick = () => {
      if (left <= 0) {
        btn.disabled = false; msg.textContent = '';
        clearInterval(timer); timer = null; return;
      }
      msg.textContent = `Email sent. You can resend in ${left}s.`;
      left--;
    };
    tick();
    timer = setInterval(tick, 1000);
  };

  btn.onclick = async () => {
    try {
      const sb = await ensureClient();
      await sb.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: URL_ACCOUNT }
      });
      startCooldown(60);
    } catch {
      toast('Could not resend right now. Please try again soon.');
    }
  };
}

/* -------------------------- Dedicated confirm screen -------------------------- */

async function renderConfirmEmailScreen(email){
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="offline-banner"></div>
    <div class="container">
      <div class="host-wrap">
        <h2>Check your email</h2>
        <p class="help">We sent a confirmation link to <strong>${email}</strong>. Please confirm to continue.</p>
        <div id="resendArea"></div>
        <div class="controls-row" style="margin-top:8px;">
          <a class="help" href="#/login">Back to Login</a>
        </div>
      </div>
    </div>
  `;
  await renderHeader(); ensureDebugTray();
  mountResendControls($('#resendArea'), email);
}

/* --------------------------------- Router --------------------------------- */

export async function render(ctx){
  const q = parseHashQuery();
  const tab = (ctx?.tab || q.tab || 'account');

  // Rewrite legacy path to the new dedicated route
  if (tab === 'reset' && location.hash.startsWith('#/account')) { location.hash = '#/reset'; return; }

  if (tab === 'login') return renderLogin();
  if (tab === 'register') return renderRegister();
  if (tab === 'forgot') return renderForgotPassword();
  if (tab === 'reset') return renderResetPassword(ctx);

  const app = document.getElementById('app');
  const session = await getSession();
  const user = session?.user || null;
  if (!user) {
    try { sessionStorage.setItem('__redirect_after_login', '#/account'); } catch {}
    location.hash = '#/login';
    app.innerHTML = `
      <div class="offline-banner"></div>
      <div class="container">
        <div class="host-wrap">
          <h2>Account</h2>
          <p>You need to log in to view your account.</p>
          <p><a class="btn" href="#/login?next=%2F#%2Faccount">Go to Login</a></p>
        </div>
      </div>`;
    await renderHeader(); ensureDebugTray();
    return;
  }

  if (tab === 'change-password') return renderChangePassword(user);
  if (tab === 'profile') return renderProfile(user);

  const dbName = await getProfileName(user.id);
  const name = dbName || user?.user_metadata?.name || (user?.email ? user.email.split('@')[0] : 'Account');
  app.innerHTML = `
    <div class="offline-banner"></div>
    <div class="container">
      <div class="host-wrap">
        <h2>Welcome, ${name}</h2>
        <div class="grid">
          <a class="help" href="#/account?tab=change-password">Change password</a>
          <a class="help" href="#/account?tab=profile">Update profile</a>
          <button id="logoutBtn" class="ghost">Logout</button>
        </div>
      </div>
    </div>`;
  await renderHeader(); ensureDebugTray();

  try { const sb = await ensureClient(); await attachGuestIfPending(sb); } catch {}
  $('#logoutBtn').onclick = async () => {
    try { const sb = await ensureClient(); await sb.auth.signOut(); } catch {}
    try{ localStorage.removeItem('ms_lastKnownUser'); localStorage.removeItem('remember_me'); sessionStorage.removeItem('remember_me'); sessionStorage.removeItem('__redirect_after_login'); }catch{}
    try{ await renderHeader(); }catch{}
    location.hash = '#/login';
  };
}

/* ---------------------------------- Login ---------------------------------- */

async function renderLogin(){
  const app=document.getElementById('app');
  const redirectTo = sessionStorage.getItem('__redirect_after_login') || '#/';
  app.innerHTML = `
    <div class="offline-banner"></div>
    <div class="container">
      <div class="host-wrap">
        <h2>Login</h2>
        <div id="loginCard" class="grid">
          <input id="email" class="input" placeholder="Email" type="email" autocomplete="email">
          <input id="password" class="input" placeholder="Password" type="password" autocomplete="current-password">
          <label class="help"><input id="remember" type="checkbox"> Remember me</label>
          <button id="loginBtn" class="btn">Login</button>
          <div class="inline-actions">
            <a class="help" href="#/register">Create new user</a>
            <a class="help" href="#/account?tab=forgot">Forgot password?</a>
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
        if (msg.includes('confirm') || msg.includes('verified')) {
          const slot = document.createElement('div');
          slot.id = 'resendAreaLogin';
          $('#loginCard').appendChild(slot);
          mountResendControls(slot, email);
        }
        throw error;
      }
      const remember = !!$('#remember').checked;
      (remember?localStorage:sessionStorage).setItem('remember_me', JSON.stringify(remember));
      await attachGuestIfPending(sb);
      location.hash = redirectTo;
      sessionStorage.removeItem('__redirect_after_login');
    }catch(e){ toast(e.message||'Login failed'); }
  };
}

/* ------------------------------ Forgot Password ----------------------------- */

async function renderForgotPassword(){
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="offline-banner"></div>
    <div class="container">
      <div class="host-wrap">
        <h2>Forgot password</h2>
        <div id="forgotCard" class="grid">
          <input id="fp_email" class="input" placeholder="Email" type="email" autocomplete="email">
          <button id="fp_send" class="btn">Send reset link</button>
          <div class="inline-actions">
            <a class="help" href="#/login">Back to Login</a>
            <a class="help" href="#/register">Create new user</a>
          </div>
          <p id="fp_msg" class="help"></p>
        </div>
      </div>
    </div>`;
  await renderHeader(); ensureDebugTray();

  $('#fp_send').onclick = async () => {
    const email = ($('#fp_email')?.value || '').trim();
    if (!email) { toast('Please enter your email'); return; }
    try {
      $('#fp_send').disabled = true;
      const sb = await ensureClient();
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: URL_RESET });
      if (error) throw error;
      $('#fp_msg').textContent = 'Check your email for a reset link.';
    } catch(e) {
      toast(e.message || 'Could not send reset email');
    } finally {
      $('#fp_send').disabled = false;
    }
  };
}

/* ------------------------------ Reset Password ------------------------------ */

async function renderResetPassword(ctx){
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="offline-banner"></div>
    <div class="container">
      <div class="host-wrap">
        <h2>Reset password</h2>
        <div id="resetCard" class="grid">
          <input id="rp_new" class="input" type="password" placeholder="New password" autocomplete="new-password">
          <input id="rp_confirm" class="input" type="password" placeholder="Confirm new password" autocomplete="new-password">
          <button id="rp_update" class="btn">Update password</button>
          <p id="rp_msg" class="help"></p>
        </div>
      </div>
    </div>`;
  await renderHeader(); ensureDebugTray();

 // Establish session from URL params for recovery landing
 try {
   const sb = await ensureClient();
   const q = (ctx && ctx.query) ? ctx.query : {};
   const access_token  = q.access_token || null;
   const refresh_token = q.refresh_token || null;
   const type          = (q.type || '').toLowerCase();
   const token_hash    = q.token || null;

   if (access_token && refresh_token) {
     const { error: sErr } = await sb.auth.setSession({ access_token, refresh_token });
     if (sErr) console.warn('setSession failed', sErr);
   } else if (type === 'recovery' && token_hash) {
     const { error: vErr } = await sb.auth.verifyOtp({ type: 'recovery', token_hash });
     if (vErr) console.warn('verifyOtp failed', vErr);
   }

   const { data: sess } = await sb.auth.getSession();
   if (!sess || !sess.session || !sess.session.user) {
     const msg = document.getElementById('rp_msg');
     if (msg) msg.textContent = 'Auth session missing. Please open the reset link again or request a new one.';
   }
 } catch (e) {
   console.warn('Recovery session init failed', e);
 }


  $('#rp_update').onclick = async () => {
    const p1 = $('#rp_new').value;
    const p2 = $('#rp_confirm').value;
    try {
      if (!p1 || p1.length < 6) throw new Error('Password must be at least 6 characters.');
      if (p1 !== p2) throw new Error('Passwords do not match.');
      $('#rp_update').disabled = true;
      const sb = await ensureClient();
      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) throw error;
      await sb.auth.signOut();
      toast('Password updated. Please log in.');
      location.hash = '#/login';
    } catch(e) {
      toast(e.message || 'Could not update password');
    } finally {
      $('#rp_update').disabled = false;
    }
  };
}

/* ----------------------------- Change Password ------------------------------ */

async function renderChangePassword(user){
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="offline-banner"></div>
    <div class="container">
      <div class="host-wrap">
        <h2>Change password</h2>
        <div id="cpCard" class="grid">
          <input id="cp_current" class="input" type="password" placeholder="Current password" autocomplete="current-password">
          <input id="cp_new" class="input" type="password" placeholder="New password" autocomplete="new-password">
          <input id="cp_confirm" class="input" type="password" placeholder="Confirm new password" autocomplete="new-password">
          <button id="cp_update" class="btn">Update</button>
          <div class="inline-actions">
            <a class="help" href="#/account">Back to Account</a>
            <a class="help" href="#/account?tab=profile">Update profile</a>
          </div>
          <p id="cp_msg" class="help"></p>
        </div>
      </div>
    </div>`;
  await renderHeader(); ensureDebugTray();

  $('#cp_update').onclick = async () => {
    const curr = $('#cp_current').value;
    const p1 = $('#cp_new').value;
    const p2 = $('#cp_confirm').value;
    try {
      if (!curr) throw new Error('Please enter your current password.');
      if (!p1 || p1.length < 6) throw new Error('New password must be at least 6 characters.');
      if (p1 !== p2) throw new Error('New passwords do not match.');

      $('#cp_update').disabled = true;
      const sb = await ensureClient();
      const email = user.email;
      const { error: reauthError } = await sb.auth.signInWithPassword({ email, password: curr });
      if (reauthError) throw new Error('Current password is incorrect.');

      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) throw error;

      await sb.auth.signOut();
      toast('Password updated. Please log in.');
      location.hash = '#/login';
    } catch(e) {
      toast(e.message || 'Could not update password');
    } finally {
      $('#cp_update').disabled = false;
    }
  };
}

/* ------------------------------- Update Profile ------------------------------ */

async function renderProfile(user){
  const app = document.getElementById('app');
  let name = user?.user_metadata?.name || '';
  let birthdate = user?.user_metadata?.birthdate || '';
  let genderMeta = user?.user_metadata?.gender || '';

  try {
    const sb = await ensureClient();
    const { data: prof, error } = await sb.from('profiles').select('name, birthdate, gender').eq('id', user.id).maybeSingle();
    if (!error && prof) {
      name = prof.name ?? name;
      birthdate = prof.birthdate ?? birthdate;
      genderMeta = prof.gender ?? genderMeta;
    }
  } catch {}

  const genderUi = genderMeta === 'man' ? 'male' : (genderMeta === 'woman' ? 'female' : '');

  app.innerHTML = `
    <div class="offline-banner"></div>
    <div class="container">
      <div class="host-wrap">
        <h2>Update profile</h2>
        <div id="pfCard" class="grid">
          <input id="pf_name" class="input" placeholder="Name" value="${name || ''}" autocomplete="name">
          <input id="pf_email" class="input" placeholder="Email" value="${user.email}" readonly>
          <input id="pf_dob" class="input" type="date" value="${birthdate || ''}">
          <div class="inline-actions">
            <label class="inline-actions"><input type="radio" name="pf_gender" value="male" ${genderUi==='male'?'checked':''}> <span>Male</span></label>
            <label class="inline-actions"><input type="radio" name="pf_gender" value="female" ${genderUi==='female'?'checked':''}> <span>Female</span></label>
          </div>
          <button id="pf_save" class="btn">Save</button>
          <div class="inline-actions">
            <a class="help" href="#/account">Back to Account</a>
            <a class="help" href="#/account?tab=change-password">Change password</a>
          </div>
          <p id="pf_msg" class="help"></p>
        </div>
      </div>
    </div>`;
  await renderHeader(); ensureDebugTray();

  $('#pf_save').onclick = async () => {
    const newName = ($('#pf_name')?.value||'').trim();
    const dobISO = ($('#pf_dob')?.value||'').trim();
    const gUi = (document.querySelector('input[name=pf_gender]:checked')||{}).value || '';
    const gender = gUi === 'male' ? 'man' : (gUi === 'female' ? 'woman' : null);

    try {
      if (!newName) throw new Error('Please enter your name.');
      if (!dobISO) throw new Error('Please select your date of birth.');
      const age = computeAge(dobISO);
      if (!(age >= 12 && age <= 100)) throw new Error('Your age must be between 12 and 100.');
      if (!gender) throw new Error('Please select Male or Female.');

      $('#pf_save').disabled = true;
      const sb = await ensureClient();

      const { error: upErr } = await sb.from('profiles').update({
        name: newName, birthdate: dobISO, gender
      }).eq('id', user.id);
      if (upErr) throw upErr;

      const { error: metaErr } = await sb.auth.updateUser({ data: { name: newName, birthdate: dobISO, gender } });
      if (metaErr) throw metaErr;

      toast('Profile updated.');
      location.hash = '#/account';
    } catch(e) {
      toast(e.message || 'Could not update profile');
    } finally {
      $('#pf_save').disabled = false;
    }
  };
}

/* -------------------------------- Register (existing) ------------------------------- */

async function renderRegister(){
  const app = document.getElementById('app');
  const redirectAfter = '#/account';
  app.innerHTML = `
    <div class="offline-banner"></div>
    <div class="container">
      <h2 style="text-align:center;">Hey, happy to see you!</h2>
      <div class="host-wrap">
        <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <!-- Row 1 -->
          <label class="help" style="color:var(--green);font-weight:700;grid-column:1;grid-row:1;">Create a new account</label>
          <a href="#/login" class="help" style="text-decoration:underline;grid-column:2;grid-row:1;">I have an account</a>
          <!-- Row 2 -->
          <input id="reg_name" class="input" placeholder="Name" autocomplete="name" style="grid-column:1;grid-row:2;">
          <input id="reg_dob" class="input" type="date" style="grid-column:2;grid-row:2;">
          <!-- Row 3 -->
          <div class="inline-actions" style="grid-column:1;grid-row:3;">
            <label class="inline-actions"><input type="radio" name="reg_gender" value="male"> <span>Male</span></label>
            <label class="inline-actions"><input type="radio" name="reg_gender" value="female"> <span>Female</span></label>
          </div>
          <div style="grid-column:2;grid-row:3;"></div>
          <!-- Row 4: Email / Password aligned -->
          <input id="reg_email" class="input" placeholder="Email" type="email" autocomplete="email" style="grid-column:1;grid-row:4;">
          <input id="reg_password" class="input" placeholder="Password" type="password" autocomplete="new-password" style="grid-column:2;grid-row:4;">
        </div>

        <div class="grid" style="gap:14px;margin-top:16px;">
          <label class="help"><input id="reg_consent_tc" type="checkbox"> I agree to the <a class="help" href="#/terms" style="text-decoration:underline;">Terms and Conditions</a></label>
          <label class="help"><input id="reg_consent_privacy" type="checkbox"> I consent to the processing of my personal data according to the <a class="help" href="#/privacy" style="text-decoration:underline;">Privacy Notice</a></label>
        </div>

        <div class="controls-row">
          <button id="reg_submit" class="btn">Submit</button>
        </div>

        <div id="feedbackArea" class="grid"></div>
      </div>
    </div>`;
  await renderHeader(); ensureDebugTray();

  $('#reg_submit').onclick = async () => {
    const name = ($('#reg_name')?.value||'').trim();
    const ui = (document.querySelector('input[name=reg_gender]:checked')||{}).value || '';
    const gender = ui === 'male' ? 'man' : (ui === 'female' ? 'woman' : null);
    const email = ($('#reg_email')?.value||'').trim();
    const password = $('#reg_password')?.value||'';
    const dobISO = ($('#reg_dob')?.value||'').trim();
    try{
      if (!name) throw new Error('Please enter your name.');
      if (!gender) throw new Error('Please select Male or Female.');
      if (!dobISO) throw new Error('Please select your date of birth.');
      const age = computeAge(dobISO); if (!(age >= 12 && age <= 100)) throw new Error('Your age must be between 12 and 100.');
      if (!email) throw new Error('Please enter your email.');
      if (!password || password.length < 6) throw new Error('Please choose a password (min 6 chars).');
      if (!document.getElementById('reg_consent_tc').checked) throw new Error('Please accept the Terms and Conditions.');
      if (!document.getElementById('reg_consent_privacy').checked) throw new Error('Please accept the Privacy Notice.');

      const sb = await ensureClient();
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { name, birthdate: dobISO, gender }, emailRedirectTo: URL_ACCOUNT }
      });
      if (error) throw error;

      const needsConfirm = (!!data?.user && !data?.session);
      if (needsConfirm) { await renderConfirmEmailScreen(email); return; }

      await attachGuestIfPending(sb);
      location.hash = redirectAfter;
    }catch(e){ toast(e.message || 'Registration failed'); }
  };
}
