
/*! Account screens v49 */
(function (global) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.screens = App.screens || {};

  // Utilities
  function el(html){
    const div = document.createElement('div');
    div.innerHTML = html.trim();
    return div.firstChild;
  }
  function getFunctionsBase(){
    try{ return (window.CONFIG && window.CONFIG.FUNCTIONS_BASE) || ''; }catch(_e){ return ''; }
  }
  async function getSupabase(){
    if (global.__MS_SUPA) return global.__MS_SUPA;
    if (!global.supabase){
      console.error('Supabase JS not found on page.');
      throw new Error('Supabase not available');
    }
    const base = getFunctionsBase();
    if (!base){
      console.error('FUNCTIONS_BASE missing in config.js');
      throw new Error('Missing FUNCTIONS_BASE');
    }
    let cfg = null;
    try{
      const r = await fetch(base.replace(/\/$/,'') + '/config');
      cfg = await r.json();
    }catch(e){
      console.error('Failed to load /config', e);
      throw e;
    }
    const url = cfg.supabase_url || cfg.public_supabase_url || cfg.url;
    const anon = cfg.supabase_anon_key || cfg.public_supabase_anon_key || cfg.anon;
    if (!url || !anon) throw new Error('Missing supabase url/anon');
    global.__MS_SUPA = global.supabase.createClient(url, anon);
    return global.__MS_SUPA;
  }
  function getReturnTo(){
    try{ return sessionStorage.getItem('ms_return_to') || '#'; }catch(_e){ return '#'; }
  }
  function clearReturnTo(){
    try{ sessionStorage.removeItem('ms_return_to'); }catch(_e){}
  }

  // Screens
  App.screens.account = {
    async renderLogin(el){
      if (!el) return;
      const supa = await getSupabase();
      const section = el;
      section.innerHTML = [
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
      const form = section.querySelector('#accLoginForm');
      const email = section.querySelector('#accEmail');
      const pass  = section.querySelector('#accPassword');
      const msg   = section.querySelector('#accLoginMsg');
      form.addEventListener('submit', async function(ev){
        ev.preventDefault();
        msg.textContent = 'Signing in...';
        try{
          const { data, error } = await supa.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
          if (error){ msg.textContent = 'Login failed, ' + error.message; return; }
          msg.textContent = 'OK';
          try{ clearReturnTo(); }catch(_e){}
          // Prefer to navigate to profile to show logout
          try{ location.hash = '/account/profile'; }catch(_e){}
        }catch(e){
          msg.textContent = 'Unexpected error, please try again';
        }
      });
    },

    async renderProfile(el){
      if (!el) return;
      const supa = await getSupabase();
      const { data: { user } } = await supa.auth.getUser();
      const email = user && user.email || '';
      el.innerHTML = [
        '<section class="p-4 max-w-md mx-auto">',
        '  <h2 class="text-lg">Account</h2>',
        `  <p class="text-sm" style="opacity:.8">Signed in as ${email ? email.replace(/</g,'&lt;') : '(unknown)'}</p>`,
        '  <div style="height:8px"></div>',
        '  <button id="accLogoutBtn" class="btn">Logout</button>',
        '</section>'
      ].join('');
      const btn = el.querySelector('#accLogoutBtn');
      btn.addEventListener('click', async function(){
        try{ await supa.auth.signOut(); }catch(_e){}
        try{ location.hash = '/account/login'; }catch(_e){}
      });
    },

    async renderRegister(el){
      if (!el) return;
      el.innerHTML = [
        '<section class="p-4 max-w-md mx-auto">',
        '  <h2 class="text-lg">Register</h2>',
        '  <p class="text-sm opacity-70">To be implemented later.</p>',
        '</section>'
      ].join('');
    },

    async renderSubscription(el){
      if (!el) return;
      el.innerHTML = [
        '<section class="p-4 max-w-md mx-auto">',
        '  <h2 class="text-lg">Subscription</h2>',
        '  <p class="text-sm opacity-70">Manage subscription will come later.</p>',
        '</section>'
      ].join('');
    }
  };
})(window);
