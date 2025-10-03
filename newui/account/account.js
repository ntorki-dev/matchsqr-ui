/*! Account screens — surgical replacement (v49.s1) */
(function (global) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.screens = App.screens || {};

  // --- Utilities ---
  function $(id){ return document.getElementById(id); }
  function hideById(id){ const n=$(id); if (n) n.classList.add('hidden'); }
  function showById(id){ const n=$(id); if (n) n.classList.remove('hidden'); }

  function getSupa(){
    // Reuse ONE existing client to avoid "Multiple GoTrueClient instances" warning
    if (global.state && global.state.supa) return global.state.supa;
    throw new Error('Supabase client not ready'); // strict: do not create another client
  }

  function enterAccountPageMode(){
    hideById('home');
    hideById('host');
    hideById('join');
    const root = $('spa-root'); if (root) root.removeAttribute('hidden');
    window.scrollTo(0,0);
  }
  function leaveAccountPageMode(){
    showById('home');
    hideById('host');
    hideById('join');
    const root = $('spa-root'); if (root) root.setAttribute('hidden','');
  }

  function setHeaderForLogin(){
    // Keep your original button style (do not change classes/styles)
    var btn = $('btnAuth'); if (!btn) return;
    btn.removeAttribute('title');
    btn.style.background = ''; btn.style.border = ''; btn.style.padding=''; btn.style.margin='';
    btn.textContent = 'Login';
    btn.onclick = function(){ try{ location.hash = '/account/login'; }catch(_e){} };
  }
  function setHeaderForProfile(){
    var btn = $('btnAuth'); if (!btn) return;
    // Remove any button background/border to avoid the white "square"
    btn.title = 'Account';
    btn.className = ''; // remove .btn etc.
    btn.style.background = 'none';
    btn.style.border = 'none';
    btn.style.padding = '0';
    btn.style.margin = '0';
    btn.innerHTML =
      '<span style="display:inline-grid;place-items:center;width:34px;height:34px;border-radius:9999px;border:1px solid rgba(255,255,255,.3);background:transparent;">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" style="display:block;color:#16a34a">' +
          '<path fill="currentColor" d="M12 12a4 4 0 1 0-0.001-8.001A4 4 0 0 0 12 12zm0 2c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z"></path>' +
        '</svg>' +
      '</span>';
    btn.onclick = function(){ try{ location.hash = '/account/profile'; }catch(_e){} };
  }

  // --- Screens ---
  App.screens.account = {
    async renderLogin(el){
      enterAccountPageMode();
      setHeaderForLogin();

      let supa;
      try{ supa = getSupa(); }
      catch(e){
        el.innerHTML = '<section class="p-4 max-w-md mx-auto"><h2 class="text-lg">Login</h2><p class="text-sm">Please refresh — auth is not ready yet.</p></section>';
        return;
      }

      el.innerHTML = [
        '<section class="p-4 max-w-md mx-auto">',
        '  <h2 class="text-lg">Login</h2>',
        '  <form id="accLoginForm" class="col" style="gap:8px;margin-top:8px">',
        '    <input id="accEmail" type="email" placeholder="Email" required style="max-width:320px"/>',
        '    <input id="accPassword" type="password" placeholder="Password" required style="max-width:220px"/>',
        '    <button class="btn primary" id="accLoginBtn" type="submit">Login</button>',
        '  </form>',
        '  <p id="accLoginMsg" class="text-sm" style="opacity:.7;margin-top:8px"></p>',
        '</section>'
      ].join('');

      const form = el.querySelector('#accLoginForm');
      const email = el.querySelector('#accEmail');
      const pass  = el.querySelector('#accPassword');
      const msg   = el.querySelector('#accLoginMsg');

      form.addEventListener('submit', async function(ev){
        ev.preventDefault();
        msg.textContent = 'Signing in...';
        try{
          const { error } = await supa.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
          if (error){ msg.textContent = 'Login failed, ' + error.message; return; }
          try{ if (global.state) global.state.session = (await supa.auth.getSession()).data.session; }catch(_e){}
          setHeaderForProfile();
          location.hash = '/account/profile';
        }catch(e){
          msg.textContent = 'Unexpected error, please try again';
        }
      });
    },

    async renderProfile(el){
      enterAccountPageMode();

      let supa;
      try{ supa = getSupa(); }
      catch(e){
        el.innerHTML = '<section class="p-4 max-w-md mx-auto"><h2 class="text-lg">Account</h2><p class="text-sm">Please refresh — auth is not ready yet.</p></section>';
        return;
      }

      const { data: { user } } = await supa.auth.getUser();
      const email = (user && user.email) || '';

      setHeaderForProfile();

      el.innerHTML = [
        '<section class="p-4 max-w-md mx-auto">',
        '  <h2 class="text-lg">Account</h2>',
        `  <p class="text-sm" style="opacity:.8">Signed in as ${email ? email.replace(/</g,'&lt;') : '(unknown)'}</p>`,
        '  <div style="height:8px"></div>',
        '  <button id="accLogoutBtn" class="btn">Logout</button>',
        '</section>'
      ].join('');

      el.querySelector('#accLogoutBtn').addEventListener('click', async function(){
        try{ await supa.auth.signOut(); }catch(_e){}
        try{ if (global.state) global.state.session = null; }catch(_e){}
        setHeaderForLogin();
        location.hash = '/account/login';
      });
    },

    async renderRegister(el){
      enterAccountPageMode();
      el.innerHTML = '<section class="p-4"><h2 class="text-lg">Register</h2><p class="text-sm opacity-70">Coming later.</p></section>';
    },

    async renderSubscription(el){
      enterAccountPageMode();
      el.innerHTML = '<section class="p-4"><h2 class="text-lg">Subscription</h2><p class="text-sm opacity-70">Coming later.</p></section>';
    }
  };

  // Leave account mode when navigating elsewhere
  window.addEventListener('hashchange', function(){
    if (!/^#\/account\//.test(location.hash || '')) {
      leaveAccountPageMode();
    }
  });
})(window);
