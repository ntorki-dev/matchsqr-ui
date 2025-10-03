
/*! Checkout screen placeholder */
(function (global) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.screens = App.screens || {};

  App.screens.checkout = function (el) {
    if (!el) return;
    el.innerHTML = [
      '<section class=\"p-4 max-w-xl mx-auto\">',
      '<h2 class=\"text-lg\">Checkout</h2>',
      '<ul class=\"list-disc pl-5 text-sm\">',
      '<li>Extend session, one-time</li>',
      '<li>Monthly subscription</li>',
      '</ul>',
      '<p class=\"text-sm opacity-70 mt-2\">We will wire the simulated payments here.</p>',
      '</section>'
    ].join('');
  };
})(window);
