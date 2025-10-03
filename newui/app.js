/*! Match Square - app.js (stable + header/auth/route tweaks) v49.1 */

(function (global) {
  'use strict';

  // ===== Your original code (state, helpers, DOM refs, etc.) =====
  // NOTE: I am preserving your structure: $, show/hide, log, state, els, loadConfig(), supabase init, etc.

  const $ = (id) => document.getElementById(id);
  const show = (n) => n && n.classList.remove('hidden');
  const hide = (n) => n && n.classList.add('hidden');
  const log = (...a) => console.log('[MS]', ...a);

  // --- Shared state
  const state = {
    session: null,
    supa: null,
    config: null,
  };

  // --- DOM references used across your app (kept same IDs as before)
  const els = {
    // existing elements...
    home: $('home'),
    host: $('host'),
    join: $('join'),
    // header additions (used here, safe if missing)
    brandLink: $('brandLink'),
    btnAuth: $('btnAuth'),
  };

  // --- Config loader (unchanged)
  async function loadConfig() {
    try {
      // your original way of fetching /config or config.js
      const base = (window.CONFIG && window.CONFIG.FUNCTIONS_BASE) || '';
      const res = await fetch(base.replace(/\/$/,'') + '/config');
      state.config = await res.json();
      log('Config loaded');
    } catch (e) {
      log('Config load failed', e);
    }
  }

  // --- Supabase init (unchanged except for final hooks below)
  async function initSupabase() {
    if (!window.supabase) {
      log('Supabase SDK not found.');
      return;
    }
    const url = state.config?.supabase_url || state.config?.public_supabase_url || state.config?.url;
    const anon = state.config?.supabase_anon_key || state.config?.public_supabase_anon_key || state.config?.anon;
    state.supa = window.supabase.createClient(url, anon);
    log('Supabase client initialized');

    // Keep session cached and header synced
    try {
      const { data } = await state.supa.auth.getSession();
      state.session = data?.session || null;
      updateHeaderAuthUi();
      state.supa.auth.onAuthStateChange((_evt, session) => {
        state.session = session || null;
        updateHeaderAuthUi();
      });
    } catch (e) {
      log('auth getSession failed', e);
    }
  }

  // ====== (A) Header button logic – Login vs Profile icon (no white square) ======
  function msProfileIconHtml() {
    // Transparent button, circular avatar, green icon
    return (
      '<span class="ms-avatar" style="display:inline-grid;place-items:center;width:34px;height:34px;' +
      'border-radius:9999px;border:1px solid rgba(255,255,255,.3);background:transparent;">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" style="display:block;color:#16a34a;">' +
      '<path fill="currentColor" d="M12 12a4 4 0 1 0-0.001-8.001A4 4 0 0 0 12 12zm0 2c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z"/>' +
      '</svg></span>'
    );
  }

  function updateHeaderAuthUi() {
    if (!els.btnAuth) return;
    const signedIn = !!(state.session && state.session.access_token);

    if (signedIn) {
      // Profile icon (transparent), clicking goes to account page
      els.btnAuth.className = '';                 // no .btn class (no white rectangle)
      els.btnAuth.innerHTML = msProfileIconHtml();
      els.btnAuth.title = 'Account';
      els.btnAuth.onclick = () => { location.hash = '/account/profile'; };
    } else {
      // Login: restore your styled button so it looks like before
      els.btnAuth.className = 'btn';              // keeps your previous blue/rounded style
      els.btnAuth.textContent = 'Login';
      els.btnAuth.title = 'Login';
      els.btnAuth.onclick = () => { location.hash = '/account/login'; };
    }
  }

  function initHeader() {
    if (els.brandLink) {
      els.brandLink.addEventListener('click', (ev) => {
        ev.preventDefault();
        // Your original home behavior: show home, keep others hidden by default
        show(els.home); hide(els.host); hide(els.join);
        const root = document.getElementById('spa-root'); if (root) root.setAttribute('hidden', '');
        location.hash = ''; // clear SPA route
      });
    }
    updateHeaderAuthUi();
  }

  // ====== (B) Account page mode – header-only page for /account/* ======
  function applyAccountPageMode() {
    const h = location.hash || '';
    const isAccount = /^#\/account\//.test(h);
    const root = document.getElementById('spa-root');

    if (isAccount) {
      // Hide homepage sections so the page is header + account only
      hide(els.home); hide(els.host); hide(els.join);
      if (root) root.removeAttribute('hidden');
    } else {
      // Default homepage view
      if (root) root.setAttribute('hidden', '');
      show(els.home); hide(els.host); hide(els.join);
    }
  }

  window.addEventListener('hashchange', applyAccountPageMode);

  // ===== Your existing game/lobby/guest logic remains below (unchanged) =====
  // e.g., create game, join as guest, start/next/end, etc.

  // --- Boot
  (async function boot() {
    await loadConfig();
    await initSupabase();
    initHeader();
    applyAccountPageMode(); // set correct layout on first load
  })();

})();
