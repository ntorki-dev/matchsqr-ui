
/*! Game Room screen placeholder */
(function (global) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.screens = App.screens || {};

  App.screens.gameRoom = function (el) {
    if (!el) return;
    el.innerHTML = [
      '<section class=\"p-4 max-w-2xl mx-auto\">',
      '<h2 class=\"text-lg\">Game Room</h2>',
      '<p class=\"text-sm opacity-70\">Game flow including results. Placeholder screen.</p>',
      '</section>'
    ].join('');
  };
})(window);
