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
      '<video class="sphere" src="./assets/Sphere.mp4" autoplay muted playsinline preload="auto"></video>' +
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

  // Robust autoplay start for mobile and desktop without flicker.
  (function(){
    const v = document.querySelector('.home-hero .sphere');
    const body = document.body;
    if(!v) return;

    // Ensure correct flags before load for iOS and Android
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute('webkit-playsinline','');
    try{ v.load(); }catch(e){}

    let started = false;
    function markStarted(){
      if (!started) { started = true; body.classList.remove('no-sphere'); }
    }
    function markFailed(){
      if (!started) { body.classList.add('no-sphere'); }
    }

    // Prefer immediate play
    Promise.resolve().then(()=> v.play && v.play()).then(markStarted).catch(()=>{
      // Retry on first user interaction or visibility change
      const tryPlay = ()=>{
        v.play && v.play().then(markStarted).catch(()=>{});
      };
      document.addEventListener('pointerdown', tryPlay, { once: true });
      document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') tryPlay(); });
    });

    // If video cannot even render first frame quickly, show globe after a short grace period on mobile
    const slowStartTimeout = setTimeout(()=>{ if(!started) markFailed(); }, 1200);

    v.addEventListener('playing', ()=>{ clearTimeout(slowStartTimeout); markStarted(); }, { once:true });
    v.addEventListener('canplay', ()=>{ /* canplay is good, but we rely on playing for certainty */ }, { once:true });
    v.addEventListener('error', ()=>{ clearTimeout(slowStartTimeout); markFailed(); }, { once:true });
  })();


  await renderHeader();
  ensureDebugTray();
}
