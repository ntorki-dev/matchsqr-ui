/*! Account screens v49 — header-only page mode */
(function (global) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.screens = App.screens || {};

  function getFunctionsBase(){
    try{ return (window.CONFIG && window.CONFIG.FUNCTIONS_BASE) || ''; }catch(_e){ return ''; }
  }
  async function getSupabase(){
    if (global.__MS_SUPA) return global.__MS_SUPA;
    if (!global.supabase) throw new Error('Supabase JS not loaded');
    const base = getFunctionsBase(); if (!base) throw new Error('FUNCTIONS_BASE not set');
    const res = await fetch(base.replace(/\/$/,'') + '/config');
    const cfg = await res.json();
    const url = cfg.supabase_url || cfg.public_supabase_url || cfg.url;
    const anon = cfg.supabase_anon_key || cfg.public_supabase_anon_key || cfg.anon;
    if (!url || !anon) throw new Error('Missing supabase url/anon');
    global.__MS_SUPA = global.supabase.createClient(url, anon);
    return global.__MS_SUPA;
  }

  // --- Helpers to make account a "page with header only" ---
  function enterAccountPageMode(){
    // Hide legacy sections explicitly so only header + account content remain
    ['home','host','join'].forEach(id => {
      const n = document.getElementById(id);
      if (n) n.style.display = 'none';
    });
    // Ensure SPA root is visible for account pages
    const root = document.getElementById('spa-root');
    if (root) root.removeAttribute('hidden');
  }
  function leaveAccountPageMode(){
    // Restore default: show home, hide host/join (your header Home click already does this too)
    const home = document.getElementById('home');
    if (home) home.style.display = '';
    const host = document.getElementById('host');
    if (host) host.style.display = 'none';
    const join = document.getElementById('join');
    if (join) join.style.display = 'none';
    const root = document.getElementById('spa-root');
    if (root) root.setAttribute('hidden','');
  }

  App.screens.account = {
    async renderLogin(el){
      enterAccountPageMode();
      const supa = await getSupabase();
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
          // After successful login → profile page
          location.hash = '/account/profile';
        }catch(e){
          msg.textContent = 'Unexpected error, please try again';
        }
      });
    },

    async renderProfile(el){
      enterAccountPageMode();
      const supa = await getSupabase();
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
        // After logout → login page
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

  // Optional: when you navigate away from account to home via the brand, this keeps things tidy
  window.addEventListener('hashchange', function(){
    if (!/^#\/account\//.test(location.hash || '')) {
      leaveAccountPageMode();
    }
  });
})(window);
