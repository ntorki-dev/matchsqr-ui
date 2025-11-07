// account.js
import { ensureClient, getSession, getProfileName } from './api.js';
import { renderHeader, ensureDebugTray, $, toast } from './ui.js';

/** Attach guest session (Option B) after auth */
async function attachGuestIfPending(sb) {
  try {
    const raw = localStorage.getItem('ms_attach_payload');
    if (!raw) return false;
    const payload = JSON.parse(raw);
    if (!payload?.game_id || !payload?.temp_player_id) return false;

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
    localStorage.removeItem('ms_attach_payload');
    toast('Your previous session was attached to your account.');
    return true;
  } catch (e) { console.warn('attachGuestIfPending failed', e); return false; }
}

/** Resend confirmation, shown only when needed */
function showResendControl({ container, email }) {
  let row = container.querySelector('#resendRow');
  if (!row) {
    row = document.createElement('div');
    row.id = 'resendRow';
    row.className = 'grid';
    row.innerHTML = `
      <button id="resendBtn" class="btn">Resend confirmation email</button>
      <span id="resendMsg" class="help"></span>
    `;
    container.appendChild(row);
  }
  const btn = row.querySelector('#resendBtn');
  const msg = row.querySelector('#resendMsg');
  btn.disabled = false; msg.textContent = '';

  let t=null, left=0;
  const cooldown=(secs)=>{
    left = secs; btn.disabled = true;
    const tick=()=>{ if(left<=0){ btn.disabled=false; msg.textContent=''; clearInterval(t); t=null; return; }
      msg.textContent = `Email sent. You can resend in ${left}s.`; left--; };
    tick(); t=setInterval(tick,1000);
  };

  btn.onclick = async () => {
    try{
      const sb = await ensureClient();
      await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.origin + '/#/account' } });
      cooldown(60);
    }catch{ toast('Could not resend right now. Please try again soon.'); }
  };
}

export async function render(ctx){
  const tab = ctx?.tab || 'account';
  if (tab === 'login') return renderLogin();
  if (tab === 'register') return renderRegister();

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

  const dbName = await getProfileName(user.id);
  const name = dbName || user?.user_metadata?.name || (user?.email ? user.email.split('@')[0] : 'Account');
  app.innerHTML = `
    <div class="offline-banner"></div>
    <div class="container">
      <div class="host-wrap">
        <h2>Welcome, ${name}</h2>
        <div class="grid">
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
        if (msg.includes('confirm') || msg.includes('verified')) showResendControl({ container: $('#loginCard'), email });
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

async function renderRegister(){
  const app = document.getElementById('app');
  const redirectAfter = '#/account';
  app.innerHTML = `
    <div class="offline-banner"></div>
    <div class="container">
      <h2 style="text-align:center;">Hey, happy to see you!</h2>
      <div class="host-wrap">
        <div class="grid" style="grid-template-columns: 1fr 1fr;">
          <div>
            <label class="help" style="color:var(--green);font-weight:700;">Create a new account</label>
            <input id="reg_name" class="input" placeholder="Name" autocomplete="name">
            <div class="inline-actions">
              <label class="inline-actions"><input type="radio" name="reg_gender" value="male"> <span>Male</span></label>
              <label class="inline-actions"><input type="radio" name="reg_gender" value="female"> <span>Female</span></label>
            </div>
            <input id="reg_email" class="input" placeholder="Email" type="email" autocomplete="email">
          </div>
          <div>
            <a href="#/login" class="help" style="text-decoration:underline;">I have an account</a>
            <input id="reg_dob" class="input" type="date">
            <input id="reg_password" class="input" placeholder="Password" type="password" autocomplete="new-password">
          </div>
        </div>

        <div class="grid">
          <label class="help"><input id="reg_consent_tc" type="checkbox"> I agree to the <a class="help" href="#/terms" style="text-decoration:underline;">Terms and Conditions</a></label>
          <label class="help"><input id="reg_consent_privacy" type="checkbox"> I consent to the processing of my personal data according to the <a class="help" href="#/privacy" style="text-decoration:underline;">Privacy Notice</a></label>
        </div>

        <div class="controls-row">
          <button id="reg_submit" class="btn">Submit</button>
        </div>
        <div id="reg_msg" class="help"></div>
        <div id="resendWrap" class="grid"></div>
      </div>
    </div>`;
  await renderHeader(); ensureDebugTray();

  function computeAge(isoDate){
    try{ const d=new Date(isoDate), t=new Date(); let a=t.getFullYear()-d.getFullYear(); const m=t.getMonth()-d.getMonth(); if(m<0||(m===0&&t.getDate()<d.getDate())) a--; return a; }catch{ return NaN; }
  }

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
      const age = computeAge(dobISO);
      if (!(age >= 12 && age <= 100)) throw new Error('Your age must be between 12 and 100.');
      if (!email) throw new Error('Please enter your email.');
      if (!password || password.length < 6) throw new Error('Please choose a password (min 6 chars).');
      if (!$('#reg_consent_tc').checked) throw new Error('Please accept the Terms and Conditions.');
      if (!$('#reg_consent_privacy').checked) throw new Error('Please accept the Privacy Notice.');

      const sb = await ensureClient();
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { name, birthdate: dobISO, gender }, emailRedirectTo: location.origin + '/#/account' }
      });
      if (error) throw error;

      $('#reg_submit').disabled = true;
      const needsConfirm = (!!data?.user && !data?.session);
      if (needsConfirm) {
        $('#reg_msg').textContent = 'Check your email to confirm your account.';
        showResendControl({ container: $('#resendWrap'), email });
      } else {
        $('#reg_msg').textContent = 'Registration successful. Redirecting...';
        await attachGuestIfPending(sb);
        location.hash = redirectAfter;
      }
    }catch(e){ toast(e.message || 'Registration failed'); }
  };
}
