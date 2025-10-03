
/*! Host Lobby screen placeholder */
(function (global) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});
  App.screens = App.screens || {};

  App.screens.hostLobby = function (el) {
    if (!el) return;
    el.innerHTML = [
      '<section class=\"p-4 max-w-xl mx-auto\">',
      '<h2 class=\"text-lg\">Host Lobby</h2>',
      '<p class=\"text-sm opacity-70\">Create game ID, copy or share, or rejoin. Placeholder screen.</p>',
      '</section>'
    ].join('');
  };
})(window);
