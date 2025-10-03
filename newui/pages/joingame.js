
/*! Join Game screen placeholder */
(function (global) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.screens = App.screens || {};

  App.screens.joinGame = function (el) {
    if (!el) return;
    el.innerHTML = [
      '<section class=\"p-4 max-w-xl mx-auto\">',
      '<h2 class=\"text-lg\">Join Game</h2>',
      '<p class=\"text-sm opacity-70\">Logged in or guest. Placeholder screen.</p>',
      '</section>'
    ].join('');
  };
})(window);
