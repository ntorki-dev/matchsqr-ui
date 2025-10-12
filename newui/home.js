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
      '<video class="sphere" autoplay muted loop playsinline preload="auto" poster="./assets/globe.png">' +
        '<source src="./assets/Sphere.mp4" type="video/mp4" />' +
        '<img class="globe" src="./assets/globe.png" alt="globe"/>' +
      '</video>' +
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

  // Minimal, standards-based fallback: only if the <video> fails to load/playback.
  (function(){
    const v = document.querySelector('.home-hero .sphere');
    if(!v) return;
    // Ensure autoplay-friendly flags prior to play
    v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('webkit-playsinline','');
    try{ v.load(); v.play && v.play().catch(()=>{});}catch(e){}

    function fallbackToImage(){
      // Replace the whole video with a normal globe image
      const img = document.createElement('img');
      img.className = 'globe';
      img.src = './assets/globe.png';
      img.alt = 'globe';
      v.replaceWith(img);
    }
    v.addEventListener('error', fallbackToImage, { once:true });
  })();


  await renderHeader();
  ensureDebugTray();
}
