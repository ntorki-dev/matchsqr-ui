// home.js
import { renderHeader, ensureDebugTray } from './ui.js';

export async function render(){
  const app=document.getElementById('app');
  app.innerHTML = `
    <div class="offline-banner">You are offline. Trying to reconnect…</div>
    <section class="home-hero">
      <img class="globe" src="./assets/globe.png" alt="globe"/>
      <h1>Safe space to build meaningful connections.</h1>
      <p>Play with other people interactive games designed to uncover shared values, emotional style, interests, and personality.</p>
      <div class="cta-row">
        <a class="cta" id="ctaHost" href="#/host"><img src="./assets/crown.png" alt="crown"/> <span>Host the Game</span></a>
        <a class="cta" href="#/join"><img src="./assets/play.png" alt="play"/> <span>Join the Game</span></a>
      </div>
    </section>
    <a class="home-learn" href="#/terms">Learn more about MatchSqr</a>`;
  await renderHeader(); ensureDebugTray();
}