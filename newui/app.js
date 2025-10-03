
/*! Match Square - app bootstrap v49.0.0 (safe placeholder) */
(function (global) {
  'use strict';

  // Global namespace
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});

  // Version stamp visible in console for quick checks
  App.version = 'v49.0.0-bootstrap';

  // Create router instance but do not assume DOM nodes exist yet
  const RouterCtor = global.MatchSquareRouter;
  const router = RouterCtor ? new RouterCtor() : { mount(){}, add(){return this}, setNotFound(){return this}, start(){}, navigate(){} };

  // Expose a safe navigate helper
  App.navigate = function (path) {
    if (typeof router.navigate === 'function') {
      router.navigate(path);
    } else {
      // Fallback: just set the hash
      location.hash = path;
    }
  };

  // Safe mount once the DOM is ready, if the element exists
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof router.mount === 'function') {
      // Do not break existing UI, only render inside #spa-root if present
      router.mount('#spa-root');
      // Minimal routes for now. We will expand later.
      if (typeof router.add === 'function') {
        router
          .add('/', async ({ el }) => {
            if (!el) return;
            el.innerHTML = [
              '<section class=\"p-4 max-w-2xl mx-auto\">',
              '<h1 class=\"text-xl\">Match Square</h1>',
              '<p class=\"text-sm opacity-70\">SPA bootstrap is loaded. Your existing UI remains untouched.</p>',
              '</section>'
            ].join('');
          })
          .setNotFound(async ({ el, path }) => {
            if (!el) return;
            el.innerHTML = '<div class=\"p-4\">Not found: ' + path + '</div>';
          });
      }
      if (typeof router.start === 'function') router.start();
    }
    console.log('[MatchSquare]', App.version, '- SPA bootstrap ready');
  });

})(window);
