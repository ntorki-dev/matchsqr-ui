/*! account/account.js — v49.s5 (single-file, surgical & robust) */
(function (global) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.screens = App.screens || {};

  // ---------- DOM helpers ----------
  function $(id){ return document.getElementById(id); }
  function ensureRoot(){
    var el = $('spa-root');
    if (!el){
      el = document.createElement('div');
      el.id = 'spa-root';
      el.setAttribute('hidden','');
      document.body.appendChild(el);
    }
    return el;
  }
  function hideById(id){ const n=$(id); if (n){ n.classList.add('hidden'); n.style.display='none'; } }
  function showById(id){ const n=$(id); if (n){ n.classList.remove('hidden'); n.style.display=''; } }

  // ---------- Supabase access (never create a second client) ----------
  function getSupaSync(){ return (global.state && global.state.supa) || null; }
  function onceStateReady(cb){
    // Poll very lightly for up to 10s for state.supa; then run cb
    let tries = 0;
    const t = setInterval(function(){
      tries++;
      if (getSupaSync() || tries > 200){ clearInterval(t); try{ cb(getSupaSync()); }catch(_e){} }
    }, 50);
  }

  // ---------- Header button helpers (style stays in app.js; we only navigate) ----------
  function setHeaderForLogin(){
    const btn = $('btnAuth'); if (!btn) return;
    btn.onclick = function(){ location.hash = '/account/login'; };
  }
  function setHeaderForProfile(){
    const btn = $('btnAuth'); if (!btn) return;
    btn.onclick = function(){ location.hash = '/account/profile'; };
  }

  // ---------- Page mode helpers ----------
  function enterAccountPageMode(){
    ensureRoot();
    hideById('homeSection'); hideById('hostSection'); hideById('joinSection');
    const root = $('spa-root'); if (root) root.removeAttribute('hidden');
    window.scrollTo(0,0);
  }
  function leaveAccountPageMode(){
    showById('homeSection'); hideById('hostSection'); hideById('joinSection');
    const root = $('spa-root'); if (root) root.setAttribute('hidden','');
  }
  window.addEventListener('hashchange', function(){
    if (!/^#\/account\//.test(location.hash || '')) leaveAccountPageMode();
  });

  // ---------- Screens ----------
  App.screens.account = {
    async renderLogin(el){
      enterAccountPageMode();
      setHeaderForLogin();

      // Render first, then wire when supa is ready
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

      function wireWhenReady(supa){
        if (!supa){ msg.textContent = 'Please refresh — auth is not ready yet.'; return; }
        // Keep button states correct
        try{
          supa.auth.getSession().then(r=>{
            const s = r?.data?.session || null;
            if (global.state) global.state.session = s;
          });
          supa.auth.onAuthStateChange((_evt, s)=>{
            if (global.state) global.state.session = s || null;
          });
        }catch(_e){}

        form.addEventListener('submit', async function(ev){
          ev.preventDefault();
          msg.textContent = 'Signing in...';
          try{
            const { error } = await supa.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
            if (error){ msg.textContent = 'Login failed, ' + error.message; return; }
            location.hash = '/account/profile';
          }catch(e){
            msg.textContent = 'Unexpected error, please try again';
          }
        }, { once: true }); // avoid duplicate wiring
        msg.textContent = '';
      }

      const supaNow = getSupaSync();
      if (supaNow) wireWhenReady(supaNow);
      else onceStateReady(wireWhenReady);
    },

    async renderProfile(el){
      enterAccountPageMode();
      setHeaderForProfile();

      function render(supa){
        if (!supa){
          el.innerHTML = '<section class="p-4 max-w-md mx-auto"><h2 class="text-lg">Account</h2><p class="text-sm">Please refresh — auth is not ready yet.</p></section>';
          return;
        }
        supa.auth.getUser().then(({ data: { user } })=>{
          const email = (user && user.email) || '';
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
            if (global.state) global.state.session = null;
            location.hash = '/account/login';
          });
        });
      }

      const supaNow = getSupaSync();
      if (supaNow) render(supaNow);
      else onceStateReady(render);
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
})(window);
