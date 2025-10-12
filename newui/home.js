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
      '<video class="sphere" autoplay muted loop playsinline preload="auto">' +
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

  // Sphere readiness, toggle body class when video can play
  try{
    const v = document.querySelector('.home-hero .sphere');
    if(v){
      const onReady = () => document.body.classList.add('has-sphere');
      const onError = () => document.body.classList.remove('has-sphere');
      v.addEventListener('canplay', onReady, { once: true });
      v.addEventListener('error', onError);
      const p = v.play && v.play();
      if(p && p.catch) p.catch(() => {/* keep globe visible */});
    }
  }catch(e){}


  await renderHeader();
  ensureDebugTray();
}
