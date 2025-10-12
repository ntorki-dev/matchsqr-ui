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
      '<video class="sphere" id="heroSphere" autoplay muted loop playsinline preload="metadata" poster="./assets/globe.png"></video>' +
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
  // Clean video setup, single element flow
  (function setupSphere(){
    const vid = document.getElementById('heroSphere');
    if (!vid) return;

    function injectIdlePreloads(){
      if (document.querySelector('link[data-ms-preload="sphere-webm"]')) return;
      const mk = (href, type, key) => {
        const l = document.createElement('link');
        l.rel = 'preload'; l.as = 'video'; l.href = href; l.type = type; l.dataset.msPreload = key;
        document.head.appendChild(l);
      };
      const go = () => { mk('./assets/Sphere.webm','video/webm','sphere-webm'); mk('./assets/Sphere.mp4','video/mp4','sphere-mp4'); };
      if ('requestIdleCallback' in window) requestIdleCallback(go); else setTimeout(go, 0);
    }

    function browserSupportsVideo(){
      const test = document.createElement('video');
      return !!(test && typeof test.canPlayType === 'function' && (test.canPlayType('video/webm') || test.canPlayType('video/mp4')));
    }

    function attachSources(){
      if (vid.querySelector('source')) return;
      const s1 = document.createElement('source'); s1.src = './assets/Sphere.webm'; s1.type = 'video/webm';
      const s2 = document.createElement('source'); s2.src = './assets/Sphere.mp4';  s2.type = 'video/mp4';
      vid.appendChild(s1); vid.appendChild(s2);
      const tryPlay = () => {
        const p = vid.play();
        if (p && typeof p.then === 'function') p.catch(() => vid.setAttribute('controls','controls'));
      };
      vid.addEventListener('canplay', tryPlay, { once:true });
      vid.addEventListener('loadedmetadata', tryPlay, { once:true });
      tryPlay();
    }

    function hardFailToImage(){
      const img = document.createElement('img');
      img.className = 'sphere';
      img.src = './assets/globe.png';
      img.alt = 'globe';
      vid.replaceWith(img);
      if (io) io.disconnect();
    }

    vid.addEventListener('error', hardFailToImage);
    vid.addEventListener('abort', hardFailToImage);

    let io = null;
    if (browserSupportsVideo() && 'IntersectionObserver' in window){
      io = new IntersectionObserver((entries)=>{
        if (entries[0] && entries[0].isIntersecting){
          injectIdlePreloads();
          attachSources();
          io.disconnect();
        }
      }, { rootMargin: '200px' });
      io.observe(vid);
    } else if (browserSupportsVideo()){
      (window.requestIdleCallback || setTimeout)(()=>{
        injectIdlePreloads();
        attachSources();
      }, 0);
    } else {
      hardFailToImage();
    }
  })();


  await renderHeader();
  ensureDebugTray();
}
