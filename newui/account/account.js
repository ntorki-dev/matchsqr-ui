
/*! account/account.js — v49.stable (uses window.msAuth, honors return-to) */
(function (global) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.screens = App.screens || {};

  // DOM helpers
  function $(id){ return document.getElementById(id); }
  function ensureRoot(){
    var el = $('spa-root');
    if (!el){ el = document.createElement('div'); el.id='spa-root'; document.body.appendChild(el); }
    return el;
  }
  function hideById(id){ const n=$(id); if (n) n.style.display='none'; }
  function showById(id){ const n=$(id); if (n) n.style.display=''; }

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

  App.screens.account = {
    async renderLogin(el){
      enterAccountPageMode();
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
          if (!window.msAuth) throw new Error('Auth not ready');
          await window.msAuth.signIn(email.value.trim(), pass.value);
          // redirect: honor return-to only if not an account route
          try {
            const ret = sessionStorage.getItem('ms_return_to');
            if (ret && !/^#?\/account\//.test(ret)) {
              sessionStorage.removeItem('ms_return_to');
              location.hash = ret.charAt(0)==='#' ? ret : '#'+ret;
            } else {
              location.hash = '/account/profile';
            }
          } catch(_e) {
            location.hash = '/account/profile';
          }
        }catch(e){
          msg.textContent = 'Login failed: ' + (e && e.message or 'error');
        }
      });
    },

    async renderProfile(el){
      enterAccountPageMode();
      let userEmail = '';
      try{
        if (window.msAuth){
          const sess = await window.msAuth.getSession();
          if (sess && sess.user) userEmail = sess.user.email || '';
          else {
            // fetch user explicitly
            try {
              const s = await window.msAuth.getSession();
              userEmail = (s && s.user && s.user.email) || '';
            } catch(_){}
          }
        }
      }catch(_){}
      el.innerHTML = [
        '<section class="p-4 max-w-md mx-auto">',
        '  <h2 class="text-lg">Account</h2>',
        `  <p class="text-sm" style="opacity:.8">Signed in as ${userEmail ? userEmail.replace(/</g,'&lt;') : '(unknown)'}</p>`,
        '  <div style="height:8px"></div>',
        '  <button id="accLogoutBtn" class="btn">Logout</button>',
        '</section>'
      ].join('');
      el.querySelector('#accLogoutBtn').addEventListener('click', async function(){
        try{ if (window.msAuth) await window.msAuth.signOut(); }catch(_){}
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
})(window);
