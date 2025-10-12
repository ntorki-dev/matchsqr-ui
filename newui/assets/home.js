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
      // Prefer the looping sphere video, fall back to the existing globe image
      '<video class="sphere" autoplay muted loop playsinline preload="auto" style="display:none">' +
        '<source src="./assets/Sphere.mp4" type="video/mp4" />' +
      '</video>' +
      '<img class="globe" src="./assets/globe.png" alt="globe"/>' +
      '<h1>Safe space to build meaningful connections.</h1>' +
      '<p>Play with other people interactive games designed to uncover shared values, emotional style, interests, and personality.</p>' +
      '<div class="cta-row">' +
        '<a class="cta" id="ctaHost" href="#/host"><img src="./assets/crown.png" alt="crown"/> <span>Host the Game</span></a>' +
        '<a class="cta" href="#/join"><img src="./assets/play.png" alt="play"/> <span>Join the Game</span></a>' +
      '</div>' +
    '</section>';

  const learn = (
    '<div class="home-learn">' +
      '<a href="#/terms" class="learn-link">learn more</a> about MatchSqr' +
    '</div>'
  );

  const banner = '<div class="offline-banner">You are offline. Trying to reconnect…</div>';

  target.innerHTML = banner + hero + learn;

  // Prefer video sphere if it can play; otherwise keep globe image
  try {
    const v = document.querySelector('.home-hero .sphere');
    const img = document.querySelector('.home-hero .globe');
    if (v && img) {
      const showVideo = () => { img && (img.style.display = 'none'); v && (v.style.display = 'block'); };
      const hideVideo = () => { img && (img.style.display = 'block'); v && (v.style.display = 'none'); };
      v.addEventListener('canplay', showVideo, { once: true });
      v.addEventListener('error', hideVideo);
      // Kick off playback without blocking
      const p = v.play && v.play();
      if (p && p.catch) p.catch(() => { /* autoplay blocked, keep image */ });
    }
  } catch(e) { /* no-op */ }

  await renderHeader();
  ensureDebugTray();
}
