
/*! Account screens placeholder - safe, does not run until wired */
(function (global) {
  'use strict';
  const App = global.MatchSquareApp || (global.MatchSquareApp = {});

  // Register functions so we can bind them to routes later
  App.screens = App.screens || {};
  App.screens.account = {
    renderLogin: function (el) {
      if (!el) return;
      el.innerHTML = [
        '<section class=\"p-4 max-w-md mx-auto\">',
        '<h2 class=\"text-lg\">Sign in</h2>',
        '<p class=\"text-sm opacity-70\">Placeholder screen. No logic attached yet.</p>',
        '</section>'
      ].join('');
    },
    renderRegister: function (el) {
      if (!el) return;
      el.innerHTML = [
        '<section class=\"p-4 max-w-md mx-auto\">',
        '<h2 class=\"text-lg\">Create account</h2>',
        '<p class=\"text-sm opacity-70\">Placeholder screen.</p>',
        '</section>'
      ].join('');
    },
    renderProfile: function (el) {
      if (!el) return;
      el.innerHTML = [
        '<section class=\"p-4 max-w-md mx-auto\">',
        '<h2 class=\"text-lg\">Account & Profile</h2>',
        '<p class=\"text-sm opacity-70\">Placeholder screen.</p>',
        '</section>'
      ].join('');
    },
    renderSubscription: function (el) {
      if (!el) return;
      el.innerHTML = [
        '<section class=\"p-4 max-w-md mx-auto\">',
        '<h2 class=\"text-lg\">Subscription</h2>',
        '<p class=\"text-sm opacity-70\">Placeholder. We will simulate payments later.</p>',
        '</section>'
      ].join('');
    }
  };
})(window);
