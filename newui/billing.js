// billing.js
import { renderHeader, ensureDebugTray, $, toast } from './ui.js';

export async function render(){
  const app=document.getElementById('app');
  app.innerHTML=`
    <div class="offline-banner">You are offline. Trying to reconnect…</div>
    <div class="container"><div style="max-width:720px;margin:28px auto;">
      <h2>Billing</h2><div class="grid">
        <button class="btn" id="extend">Extend game by 60 min</button>
        <button class="btn secondary" id="extra">Buy extra weekly game</button>
        <button class="btn warn" id="sub">Subscribe</button>
      </div></div></div>`;
  await renderHeader(); ensureDebugTray();
  $('#extend').onclick=()=>toast('Simulated: extended');
  $('#extra').onclick=()=>toast('Simulated: extra weekly game purchased');
  $('#sub').onclick=()=>toast('Simulated: subscription active');
}
