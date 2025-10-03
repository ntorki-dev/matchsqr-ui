/*! account/account.js — v49.s8 (single-file, surgical, honors return-to) */
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
      document.body.appendChild(el);
    }
    return el;
  }
  function hideById(id){ const n=$(id); if (n) n.style.display='none'; }
  function showById(id){ const n=$(id); if (n) n.style.display=''; }

  // Use the existing client only
  function getSupa(){ return (global.state && global.state.supa) || null; }

  // Quietly wait for state.supa (no error text)
  function whenSupaReady(cb){
    const tryWire = ()=>{
      const s = getSupa();
      if (s) { try { cb(s); } catch(_){} }
      else    { setTimeout(tryWire, 150); }
    };
    tryWire();
  }

  // ---------- Page mode helpers (header-only) ----------
  function enterAccountPageMode(){
    ensureRoot();
    hideById('homeSection');
    hideById('hostSection');
    hideById('joinSection');
    const root = $('spa-root'); if (root) root.removeAttribute('hidden');
    window.scrollTo(0,0);
  }
  function leaveAccountPageMode(){
    showById('homeSection');
    hideById('hostSection');
    hideById('joinSection');
    const root = $('spa-root'); if (root) root.setAttribute('hidden','');
  }
  window.addEventListener('hashchange', function(){
    if (!/^#\/account\//.test(location.hash || '')) leaveAccountPageMode();
  });

  // ---------- Screens ----------
  App.screens.account = {
    async renderLogin(el){
      enterAccountPageMode();

      // Render immediately; wire when supa appears
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

      const wire = (supa)=>{
        // Keep session in global.state so your header logic works as-is
        try {
          supa.auth.getSession().then(r=>{
            if (global.state) global.state.session = r?.data?.session || null;
          });
          supa.auth.onAuthStateChange((_evt, newSession)=>{
            if (global.state) global.state.session = newSession || null;
          });
        } catch(_) {}

        form.addEventListener('submit', async function(ev){
          ev.preventDefault();
          msg.textContent = 'Signing in...';
          try{
            const { error } = await supa.auth.signInWithPassword({
              email: email.value.trim(),
              password: pass.value
            });
            if (error){ msg.textContent = 'Login failed: ' + error.message; return; }
            // Honor return-to if set by host guard; else go profile
            try {
              const ret = sessionStorage.getItem('ms_return_to');
              if (ret) {
                sessionStorage.removeItem('ms_return_to');
                location.hash = ret;
              } else {
                location.hash = '/account/profile';
              }
            } catch(_e) {
              location.hash = '/account/profile';
            }
          }catch(e){
            msg.textContent = 'Unexpected error, please try again';
          }
        }, { once:true }); // prevent duplicate handlers
      };

      const supaNow = getSupa();
      if (supaNow) wire(supaNow); else whenSupaReady(wire);
    },

    async renderProfile(el){
      enterAccountPageMode();

      const render = async (supa)=>{
        if (!supa){
          el.innerHTML = '<section class="p-4 max-w-md mx-auto"><h2 class="text-lg">Account</h2><p class="text-sm">Loading…</p></section>';
          return;
        }
        const { data: { user } } = await supa.auth.getUser();
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
      };

      const supaNow = getSupa();
      if (supaNow) render(supaNow); else whenSupaReady(render);
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
