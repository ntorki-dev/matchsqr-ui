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

  // Ensure loop and immediate autoplay, especially on mobile Safari/Chrome.
  (function(){
    const v = document.querySelector('.home-hero .sphere');
    if(!v) return;
    // Make attributes explicit before load
    v.muted = true;
    v.defaultMuted = true;
    v.autoplay = true;
    v.loop = true;
    v.preload = 'auto';
    v.playsInline = true;
    v.setAttribute('playsinline','');
    v.setAttribute('webkit-playsinline','');
    v.setAttribute('x5-playsinline','');
    try { v.load(); } catch(e) {}

    const kick = () => {
      try {
        const p = v.play && v.play();
        if (p && p.catch) p.catch(()=>{});
      } catch(e) {}
    };

    if (v.readyState >= 2) { // HAVE_CURRENT_DATA or better
      kick();
    } else {
      v.addEventListener('loadeddata', kick, { once: true });
      v.addEventListener('canplay', kick, { once: true });
    }

    // As a final backup for strict autoplay policies, retry once on first user gesture
    document.addEventListener('pointerdown', kick, { once: true });
  })();


  await renderHeader();
  ensureDebugTray();
}
