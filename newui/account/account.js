/*! Account screens v49.2 (reuse supabase + header-only pages) */
(function (global) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.screens = App.screens || {};

  // ----- Helpers -----
  function $(id){ return document.getElementById(id); }
  function show(n){ if(n) n.classList.remove('hidden'); }
  function hide(n){ if(n) n.classList.add('hidden'); }

  function getFunctionsBase(){
    try { return (window.CONFIG && window.CONFIG.FUNCTIONS_BASE) || ''; }
    catch { return ''; }
  }

  async function getSupabase(){
    // Reuse app client if it exists (prevents "Multiple GoTrueClient" warning)
    if (App.state && App.state.supa) return App.state.supa;

    if (!global.supabase) throw new Error('Supabase JS not loaded');
    const base = getFunctionsBase();
    if (!base) throw new Error('FUNCTIONS_BASE not set');

    const res = await fetch(base.replace(/\/$/,'') + '/config');
    const cfg = await res.json();
    const url  = cfg.supabase_url || cfg.public_supabase_url || cfg.url;
    const anon = cfg.supabase_anon_key || cfg.public_supabase_anon_key || cfg.anon;
    if (!url || !anon) throw new Error('Missing Supabase url/anon');

    const supa = global.supabase.createClient(url, anon);
    App.state = App.state || {};
    App.state.supa = supa;
    return supa;
  }

  // ----- Header-only "page mode" for /account/* -----
  function enterAccountPage(){
    hide($('home')); hide($('host')); hide($('join'));
    const root = $('spa-root'); if (root) root.removeAttribute('hidden');
  }
  function leaveAccountPage(){
    const root = $('spa-root'); if (root) root.setAttribute('hidden','');
    show($('home')); hide($('host')); hide($('join'));
  }
  function isAccountRoute(){
    return /^#\/account\//.test(location.hash || '');
  }
  function applyPageMode(){
    if (isAccountRoute()) enterAccountPage(); else leaveAccountPage();
  }
  window.addEventListener('hashchange', applyPageMode);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyPageMode);
  else applyPageMode();

  // ----- Screens -----
  App.screens.account = {
    async renderLogin(el){
      enterAccountPage();
      const supa = await getSupabase();

      el.innerHTML = [
        '<section class="p-4 max-w-md mx-auto">',
        '  <h2 class="text-lg">Login</h2>',
        '  <form id="accLoginForm" class="col" style="gap:8px;margin-top:8px">',
        '    <input id="accEmail" type="email" placeholder="Email" required style="max-width:320px" />',
        '    <input id="accPassword" type="password" placeholder="Password" required style="max-width:220px" />',
        '    <button class="btn primary" id="accLoginBtn" type="submit">Login</button>',
        '  </form>',
        '  <p id="accLoginMsg" class="text-sm" style="opacity:.7;margin-top:8px"></p>',
        '</section>'
      ].join('');

      const form = el.querySelector('#accLoginForm');
      const email = el.querySelector('#accEmail');
      const pass  = el.querySelector('#accPassword');
      const msg   = el.querySelector('#accLoginMsg');

      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        msg.textContent = 'Signing in...';
        try {
          const { error } = await supa.auth.signInWithPassword({
            email: email.value.trim(),
            password: pass.value
          });
          if (error) { msg.textContent = 'Login failed, ' + error.message; return; }
          location.hash = '/account/profile';
        } catch {
          msg.textContent = 'Unexpected error, please try again';
        }
      });
    },

    async renderProfile(el){
      enterAccountPage();
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

      el.querySelector('#accLogoutBtn').addEventListener('click', async () => {
        try { await supa.auth.signOut(); } catch {}
        location.hash = '/account/login';
      });
    },

    async renderRegister(el){
      enterAccountPage();
      el.innerHTML = '<section class="p-4"><h2 class="text-lg">Register</h2><p class="text-sm opacity-70">Coming later.</p></section>';
    },

    async renderSubscription(el){
      enterAccountPage();
      el.innerHTML = '<section class="p-4"><h2 class="text-lg">Subscription</h2><p class="text-sm opacity-70">Coming later.</p></section>';
    }
  };
})(window);
