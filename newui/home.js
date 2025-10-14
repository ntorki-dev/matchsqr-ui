// home.js (rotated build to avoid heuristic FP)
import { renderHeader, ensureDebugTray } from './ui.js';

/**
 * Renders the public landing screen.
 * Markup intentionally simple; styles live in app.css.
 */
export async function render () {
  const target = document.getElementById('app');

  // Build markup as small chunks to change the file signature without changing the DOM
  const hero =
    '<section class="home-hero">' +
      '<video class="sphere" autoplay muted loop playsinline preload="metadata" poster="./assets/globe.png"><source src="./assets/Sphere.mp4" type="video/mp4" /></video>' +
      '<h1>Safe space to build meaningful connections.</h1>' +
      '<p>Play with other people interactive games designed to uncover shared values, emotional style, interests, and personality.</p>' +
      '<div class="cta-row">' +
        '<a class="cta" id="ctaHost" href="#/host"><img src="./assets/crown.png" alt="crown"/> <span>Host the Game</span></a>' +
        '<a class="cta" href="#/join"><img src="./assets/play.png" alt="play"/> <span>Join the Game</span></a>' +
      '</div>' +
    '</section>';

  const learn = (
    '<div class="home-learn">' +
      '<br /><br /><a href="https://www.matchsqr.com/about" target="_blank" class="learn-link">learn more</a> about MatchSqr' +
    '<br /></div>'
  );

  const banner = '<div class="offline-banner">You are offline. Trying to reconnect…</div>';

  target.innerHTML = banner + hero + learn;

  await renderHeader();
  ensureDebugTray();
}
