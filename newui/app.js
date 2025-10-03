
/*! Match Square - SPA bootstrap v49.0.2 (non-invasive) */
(function (global, d) {
  'use strict';

  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.version = 'v49.0.2-spa';

  // Create #spa-root but keep it hidden unless we render a SPA screen
  function ensureRoot() {
    let el = d.getElementById('spa-root');
    if (!el) {
      el = d.createElement('div');
      el.id = 'spa-root';
      el.setAttribute('hidden', '');
      d.body.appendChild(el);
    }
    return el;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      // Prevent duplicate loads
      const already = Array.from(d.scripts).some(s => s.src && s.src.endsWith(src));
      if (already) return resolve();
      const s = d.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      d.body.appendChild(s);
    });
  }

  // Normalize hash: support "#host" and "#/host"
  function getPath() {
    const raw = (location.hash || '').replace(/^#/, '');
    if (!raw) return '/';
    return raw.startsWith('/') ? raw : '/' + raw;
  }

  // Map routes to lazy-loaded files and function names
  const routeConfig = {
    '/host':        { src: 'pages/hostlobby.js', fn: 'hostLobby', ns: null },
    '/join':        { src: 'pages/joingame.js',  fn: 'joinGame',  ns: null },
    '/game':        { src: 'pages/gameroom.js',  fn: 'gameRoom',  ns: null },
    '/checkout':    { src: 'pages/checkout.js', fn: 'checkout',  ns: null },
    '/account/login':        { src: 'account/account.js', fn: 'renderLogin',        ns: 'account' },
    '/account/register':     { src: 'account/account.js', fn: 'renderRegister',     ns: 'account' },
    '/account/profile':      { src: 'account/account.js', fn: 'renderProfile',      ns: 'account' },
    '/account/subscription': { src: 'account/account.js', fn: 'renderSubscription', ns: 'account' },
  };

  const knownPaths = new Set(Object.keys(routeConfig));

  // Keep the SPA dormant unless a known route is hit
  let router = null;
  let routerReady = false;

  function isKnown(path) {
    if (knownPaths.has(path)) return true;
    // Accept prefixed game path like "/game/ABC123" as "/game"
    if (path.startsWith('/game/')) return true;
    return false;
  }

  async function ensureRouter() {
    if (routerReady) return router;
    // Load router if needed
    if (!global.MatchSquareRouter) {
      try {
        await loadScript('lib/router.js');
      } catch (e1) {
        await loadScript('/newui/lib/router.js');
      }
    }
    const RouterCtor = global.MatchSquareRouter;
    if (!RouterCtor) return null;
    router = new RouterCtor();
    router.mount('#spa-root');

    // Bind routes, but do NOT render home. Keep root hidden for "/" so we do not touch homepage.
    bindRoutes(router);

    router.guards(async () => true);
    router.start();
    routerReady = true;
    return router;
  }

  async function ensureScreenLoaded(path) {
    // Collapse dynamic game route "/game/XYZ" to "/game"
    const basePath = path.startsWith('/game/') ? '/game' : path;
    const cfg = routeConfig[basePath];
    if (!cfg) return;
    const screens = App.screens || (App.screens = {});
    // Resolve function pointer
    function getFn() {
      if (cfg.ns) {
        return (screens[cfg.ns] || {})[cfg.fn];
      }
      return screens[cfg.fn];
    }
    if (typeof getFn() === 'function') return; // already available
    // Attempt to load the script
    try {
      await loadScript(cfg.src);
    } catch (e1) {
      // Fallback to absolute-like path
      await loadScript('/newui/' + cfg.src);
    }
  }

  function bindRoutes(r) {
    // Home route: keep root hidden and render nothing
    r.add('/', async ({ el }) => {
      if (!el) return;
      el.setAttribute('hidden', '');
      // Do not inject anything on homepage to avoid affecting existing UI
    });

    // Wire the routes
    Object.keys(routeConfig).forEach((p) => {
      r.add(p, async ({ el, path }) => {
        if (!el) return;
        // Show SPA region
        el.removeAttribute('hidden');
        await ensureScreenLoaded(p);
        const cfg = routeConfig[p];
        const screens = App.screens || {};
        const fn = cfg.ns ? ((screens[cfg.ns] || {})[cfg.fn]) : screens[cfg.fn];
        if (typeof fn === 'function') {
          await fn(el);
        } else {
          el.innerHTML = '<div class="p-4 text-sm opacity-70">Screen not wired yet.</div>';
        }
      });
    });

    // Dynamic game route variant "/game/XYZ"
    r.add('/game/*', async ({ el, path }) => {
      if (!el) return;
      el.removeAttribute('hidden');
      await ensureScreenLoaded('/game');
      const screens = App.screens || {};
      const fn = screens.gameRoom;
      if (typeof fn === 'function') {
        await fn(el);
      } else {
        el.innerHTML = '<div class="p-4 text-sm opacity-70">Game screen not wired yet.</div>';
      }
    });

    // Not found, keep root hidden so homepage stays clickable
    r.setNotFound(async ({ el }) => {
      if (!el) return;
      el.setAttribute('hidden', '');
    });
  }

  async function boot() {
    ensureRoot();
    const path = getPath();

    // If not a known SPA path, keep dormant and do not render anything
    if (!isKnown(path)) {
      // Still watch for future hash changes to known paths
      window.addEventListener('hashchange', async () => {
        const p = getPath();
        if (isKnown(p)) {
          await ensureRouter();
        }
      });
      return;
    }

    // Known SPA route, initialize router now
    await ensureRouter();
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Small helper for legacy buttons that want to navigate without changing their code
  App.navigate = function (path) {
    const p = path.startsWith('#') ? path.slice(1) : path;
    location.hash = p.startsWith('/') ? p : '/' + p;
  };

  console.log('[MatchSquare]', App.version, 'loaded');
})(window, document);
