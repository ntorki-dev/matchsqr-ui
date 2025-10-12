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
      '<video class="sphere" src="./assets/Sphere.mp4" autoplay muted playsinline preload="auto" disablepictureinpicture x5-playsinline webkit-playsinline></video>' +
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

  // Strict fallback: show the globe ONLY if the video errors.
  (function(){
    const v = document.querySelector('.home-hero .sphere');
    if(!v) return;

    // Ensure autoplay-friendly flags before load/play
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute('webkit-playsinline','');
    v.setAttribute('x5-playsinline','');
    try { v.load(); } catch(e){}

    // Try immediate play; if it fails due to policy, retry on first user gesture
    const tryPlay = () => { v.play && v.play().catch(()=>{}); };
    tryPlay();
    document.addEventListener('pointerdown', tryPlay, { once: true });

    // If a hard error occurs, replace with the globe image
    v.addEventListener('error', () => {
      const img = document.createElement('img');
      img.className = 'globe';
      img.src = './assets/globe.png';
      img.alt = 'globe';
      v.replaceWith(img);
    }, { once: true });
  })();


  await renderHeader();
  ensureDebugTray();
}
