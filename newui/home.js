// home.js — Final minimal version for stable desktop/mobile playback
import { renderHeader, ensureDebugTray } from './ui.js';

/**
 * Renders the public landing screen.
 * Markup intentionally simple; styles live in app.css.
 */
export async function render () {
  const target = document.getElementById('app');

  const hero =
    '<section class="home-hero">' +
      '<video class="sphere" autoplay muted loop playsinline preload="auto">' +
        '<source src="./assets/Sphere.mp4" type="video/mp4" />' +
        '<source src="./assets/Sphere.webm" type="video/webm" />' +
      '</video>' +
      '<h1>Safe space to build meaningful connections.</h1>' +
      '<p>Play with other people interactive games designed to uncover shared values, emotional style, interests, and personality.</p>' +
      '<div class="cta-row">' +
        '<a class="cta" id="ctaHost" href="#/host"><img src="./assets/crown.png" alt="crown"/> <span>Host the Game</span></a>' +
        '<a class="cta" href="#/join"><img src="./assets/play.png" alt="play"/> <span>Join the Game</span></a>' +
      '</div>' +
    '</section>';

  const learn =
    '<div class="home-learn">' +
      '<a href="#/terms" class="learn-link">learn more</a> about MatchSqr' +
    '</div>';

  const banner = '<div class="offline-banner">You are offline. Trying to reconnect…</div>';

  target.innerHTML = banner + hero + learn;

  // --- Minimal autoplay logic ---
  (function(){
    const v = document.querySelector('.home-hero .sphere');
    if(!v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.autoplay = true;
    v.loop = true;
    v.preload = 'auto';
    v.playsInline = true;
    v.setAttribute('playsinline','');
    v.setAttribute('webkit-playsinline','');
    v.setAttribute('x5-playsinline','');

    try { v.load(); } catch(e){}

    // Attempt playback immediately and once the video can play
    const tryPlay = () => {
      try {
        const p = v.play && v.play();
        if (p && p.catch) p.catch(()=>{});
      } catch(e){}
    };
    tryPlay();
    v.addEventListener('canplay', tryPlay, { once: true });
    v.addEventListener('loadeddata', tryPlay, { once: true });

    // As a final fallback, retry on first user interaction
    document.addEventListener('pointerdown', tryPlay, { once: true });
  })();

  await renderHeader();
  ensureDebugTray();
}
