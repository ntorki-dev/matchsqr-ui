
/*! account/account.js — v49.s4 (single-file, surgical & robust) */
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
  function hideEl(el){
    if (!el) return;
    if (!el.dataset.msPrevDisplay) el.dataset.msPrevDisplay = el.style.display || '';
    el.style.display = 'none';
  }
  function showEl(el){
    if (!el) return;
    el.style.display = el.dataset.msPrevDisplay || '';
    delete el.dataset.msPrevDisplay;
  }
  function hideById(id){ hideEl($(id)); }
  function showById(id){ showEl($(id)); }

  // ---------- Supabase client (no duplicates) ----------
  function hasSupa(){ return !!(global.state && global.state.supa); }
  function getSupaSync(){ return (global.state && global.state.supa) || null; }
  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  async function waitForSupa(maxMs){
    const deadline = Date.now() + (maxMs || 10000);
    while (Date.now() < deadline){
      if (hasSupa()) return getSupaSync();
      await sleep(50);
    }
    // As a LAST resort, initialize once if absolutely missing (prevents loops).
    if (!global.__MS_SUPA && global.supabase && global.CONFIG && global.CONFIG.FUNCTIONS_BASE){
      try{
        const resp = await fetch(global.CONFIG.FUNCTIONS_BASE.replace(/\/$/,'') + '/config');
        const cfg = await resp.json();
        const url = cfg.supabase_url || cfg.public_supabase_url || cfg.url;
        const anon = cfg.supabase_anon_key || cfg.public_supabase_anon_key || cfg.anon;
        if (url && anon){
          global.__MS_SUPA = global.supabase.createClient(url, anon);
          if (global.state) global.state.supa = global.__MS_SUPA;
        }
      }catch(_e){}
    }
    return getSupaSync();
  }

  // ---------- Header button toggle ----------
  function setHeaderForLogin(){
    const btn = $('btnAuth'); if (!btn) return;
    btn.title = 'Login';
    btn.className = 'btn';          // keep original pill style for "Login"
    btn.style.background = '';
    btn.style.border = '';
    btn.style.padding = '';
    btn.style.margin = '';
    btn.innerHTML = 'Login';
    btn.onclick = function(){ location.hash = '/account/login'; };
  }
  function setHeaderForProfile(){
    const btn = $('btnAuth'); if (!btn) return;
    btn.title = 'Account';
    btn.className = '';             // remove pill/background
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
    btn.onclick = function(){ location.hash = '/account/profile'; };
  }
  function updateHeaderFromSession(){
    try{
      const session = global.state && global.state.session;
      if (session && session.access_token) setHeaderForProfile();
      else setHeaderForLogin();
    }catch(_e){}
  }

  // ---------- Page mode helpers ----------
  function enterAccountPageMode(){
    ensureRoot();
    // Hide all main sections under body except header and #spa-root
    const body = document.body;
    const keep = new Set();
    const hdr = body.querySelector('header'); if (hdr) keep.add(hdr);
    const spa = $('spa-root'); if (spa) keep.add(spa);
    Array.from(body.children).forEach(node => {
      if (!keep.has(node)) hideEl(node);
    });
    if (spa) spa.removeAttribute('hidden');
    window.scrollTo(0,0);
  }
  function leaveAccountPageMode(){
    const body = document.body;
    Array.from(body.children).forEach(node => {
      showEl(node);
    });
    const spa = $('spa-root'); if (spa) spa.setAttribute('hidden','');
  }

  // ---------- Screens ----------
  App.screens.account = {
    async renderLogin(el){
      enterAccountPageMode();
      updateHeaderFromSession();

      let supa = await waitForSupa(10000);
      if (!supa){
        el.innerHTML = '<section class="p-4 max-w-md mx-auto"><h2 class="text-lg">Login</h2><p class="text-sm">Please refresh — auth is not ready yet.</p></section>';
        return;
      }

      // Keep header synced with auth changes
      try{
        supa.auth.onAuthStateChange((_evt, newSession)=>{
          if (global.state) global.state.session = newSession || null;
          updateHeaderFromSession();
        });
      }catch(_e){}

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
          try{ const r = await supa.auth.getSession(); if (global.state) global.state.session = r?.data?.session || null; }catch(_e){}
          updateHeaderFromSession();
          location.hash = '/account/profile';
        }catch(e){
          msg.textContent = 'Unexpected error, please try again';
        }
      });
    },

    async renderProfile(el){
      enterAccountPageMode();

      let supa = await waitForSupa(10000);
      if (!supa){
        el.innerHTML = '<section class="p-4 max-w-md mx-auto"><h2 class="text-lg">Account</h2><p class="text-sm">Please refresh — auth is not ready yet.</p></section>';
        return;
      }

      try{
        supa.auth.onAuthStateChange((_evt, newSession)=>{
          if (global.state) global.state.session = newSession || null;
          updateHeaderFromSession();
        });
      }catch(_e){}

      const { data: { user } } = await supa.auth.getUser();
      const email = (user && user.email) || '';

      updateHeaderFromSession();

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
        updateHeaderFromSession();
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
