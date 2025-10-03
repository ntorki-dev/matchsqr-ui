
/*! Match Square - SPA bootstrap v49.0.1 */
(function (global, d) {
  'use strict';

  // Create minimal namespace without touching existing globals
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.version = 'v49.0.1-spa';

  // Create #spa-root if it does not exist, keep it hidden by default
  function ensureRoot() {
    let el = d.getElementById('spa-root');
    if (!el) {
      el = d.createElement('div');
      el.id = 'spa-root';
      el.setAttribute('hidden', '');
      // Append at the end of body to avoid layout shifts
      d.body.appendChild(el);
    }
    return el;
  }

  // Dynamically load a script if needed
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = d.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      d.body.appendChild(s);
    });
  }

  // Safe route handlers, only run if screens were added
  function bindRoutes(router) {
    const screens = App.screens || {};

    // Helper wrappers to avoid errors if a screen is missing
    function wrap(fnName, ns) {
      return async ({ el }) => {
        const nsObj = ns ? (screens[ns] || {}) : screens;
        const fn = ns ? nsObj[fnName] : screens[fnName];
        if (typeof fn === 'function') {
          await fn(el);
        } else if (el) {
          el.innerHTML = '<div class="p-4 text-sm opacity-70">Screen not wired yet.</div>';
        }
      };
    }

    router
      .add('/', async ({ el }) => {
        if (!el) return;
        el.innerHTML = [
          '<section class="p-4 max-w-2xl mx-auto">',
          '<h1 class="text-xl">Match Square</h1>',
          '<p class="text-sm opacity-70">SPA is ready. Your current UI stays as is.</p>',
          '</section>'
        ].join('');
      })
      // Pages
      .add('/host', wrap('hostLobby'))
      .add('/join', wrap('joinGame'))
      .add('/game', wrap('gameRoom'))
      .add('/checkout', wrap('checkout'))
      // Account subroutes
      .add('/account/login', wrap('renderLogin', 'account'))
      .add('/account/register', wrap('renderRegister', 'account'))
      .add('/account/profile', wrap('renderProfile', 'account'))
      .add('/account/subscription', wrap('renderSubscription', 'account'))
      .setNotFound(async ({ el, path }) => {
        if (!el) return;
        el.innerHTML = '<div class="p-4">Not found: ' + path + '</div>';
      });
  }

  async function boot() {
    try {
      const root = ensureRoot();

      // If router class is missing, load it from /newui/lib/router.js
      if (!global.MatchSquareRouter) {
        // Try relative path first for GitHub Pages served from /newui/
        try {
          await loadScript('lib/router.js');
        } catch (e1) {
          // Fallback: absolute-like path if site root differs
          await loadScript('/newui/lib/router.js');
        }
      }

      // Instantiate a router safely
      const RouterCtor = global.MatchSquareRouter;
      if (!RouterCtor) {
        console.warn('[MatchSquare] Router not available yet.');
        return;
      }
      const router = new RouterCtor();

      // Mount and bind
      router.mount('#spa-root');
      bindRoutes(router);

      // Optional guards placeholder, does nothing now
      router.guards(async () => true);

      // Start
      router.start();
      console.log('[MatchSquare]', App.version, '- SPA mounted');
    } catch (err) {
      console.error('[MatchSquare] SPA boot error:', err);
    }
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
