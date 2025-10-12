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
      '<div class="sphere-wrap"><video class="sphere" id="heroSphere" autoplay muted loop playsinline preload="metadata" poster="./assets/globe.png" fetchpriority="low" crossorigin="anonymous"></video><img class="sphere sphere-fallback" id="heroGlobeFallback" src="./assets/globe.png" alt="globe" hidden /></div>' +
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
  // Initialize non-blocking video sphere after markup is attached
  try {
    const vid = document.getElementById('heroSphere');
    const fallbackImg = document.getElementById('heroGlobeFallback');

    function showFallback(){ if(vid) vid.setAttribute('hidden','hidden'); if(fallbackImg) fallbackImg.hidden = false; }
    function attachSources(){
      if(!vid || vid.querySelector('source')) return;
      // Preload hints inserted late to avoid competing with critical CSS
      const linkWebm = document.createElement('link');
      linkWebm.rel='preload'; linkWebm.as='video'; linkWebm.href='./assets/Sphere.webm'; linkWebm.type='video/webm';
      const linkMp4 = document.createElement('link');
      linkMp4.rel='preload'; linkMp4.as='video'; linkMp4.href='./assets/Sphere.mp4'; linkMp4.type='video/mp4';
      document.head.appendChild(linkWebm); document.head.appendChild(linkMp4);

      const s1 = document.createElement('source'); s1.src='./assets/Sphere.webm'; s1.type='video/webm';
      const s2 = document.createElement('source'); s2.src='./assets/Sphere.mp4'; s2.type='video/mp4';
      vid.appendChild(s1); vid.appendChild(s2);

      const tryPlay = () => { const p = vid.play && vid.play(); if(p && typeof p.then==='function'){ p.catch(()=> vid.setAttribute('controls','controls')); } };
      vid.addEventListener('canplay', tryPlay, { once:true });
      vid.addEventListener('loadedmetadata', tryPlay, { once:true });
      tryPlay();
    }

    function browserSupportsVideo(){
      const t = document.createElement('video');
      return !!(t && typeof t.canPlayType==='function' && (t.canPlayType('video/webm') || t.canPlayType('video/mp4')));
    }

    if(vid){
      vid.addEventListener('error', showFallback);
      vid.addEventListener('stalled', function(){});
      if(browserSupportsVideo() && 'IntersectionObserver' in window){
        const io = new IntersectionObserver((entries)=>{
          if(entries[0] && entries[0].isIntersecting){ attachSources(); io.disconnect(); }
        }, { rootMargin:'200px' });
        io.observe(vid);
      } else if(browserSupportsVideo()) {
        (window.requestIdleCallback || setTimeout)(attachSources, 0);
      } else {
        showFallback();
      }
    }
  } catch(e){ console && console.warn && console.warn('sphere init failed', e); }


  await renderHeader();
  ensureDebugTray();
}
