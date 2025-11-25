// billing.js
import { API, resolveCode } from './api.js';
import { renderHeader, ensureDebugTray, $, toast } from './ui.js';

function parseHashParams(){
  try{
    const hash = location.hash || '';
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return { from: null, code: null };
    const query = hash.slice(qIndex + 1);
    const params = new URLSearchParams(query);
    return {
      from: params.get('from') || null,
      code: params.get('code') || null
    };
  }catch{
    return { from: null, code: null };
  }
}

export async function render(){
  const app = document.getElementById('app');
  const { from, code: rawCode } = parseHashParams();
  const code = rawCode || resolveCode(null) || '';

  app.innerHTML = `
    <div class="offline-banner">You are offline. Trying to reconnect…</div>
    <div class="container">
      <div style="max-width:720px;margin:28px auto;">
        <h2>Billing</h2>
        <p class="help">
          Manage your subscription, extra games, and extensions here.
        </p>
        <div class="grid">
          <button class="btn" id="extend">Extend game by 60 min</button>
          <button class="btn secondary" id="extra">Buy extra weekly game</button>
          <button class="btn warn" id="sub">Subscribe</button>
        </div>
      </div>
    </div>
  `;

  await renderHeader();
  ensureDebugTray();

  // Extend current game (only makes sense when we came from an extend flow)
   $('#extend').onclick = async () => {
    if (from !== 'extend'){
      toast('No active game to extend.');
      return;
    }
    if (!code){
      toast('Missing game code for extension.');
      return;
    }

    try{
      // Treat this as payment done now, extend this specific game
      const out = await API.extend_game({ code });
      const g = out?.game || out || {};
      if (!g || !g.ends_at){
        toast('Extension completed, but timer may not have updated.');
      }else{
        toast('Game extended by 60 minutes.');
      }
      // Redirect back to game screen with the same code
      location.hash = '#/game/' + encodeURIComponent(code);
    }catch(e){
      toast(e?.message || 'Failed to extend game');
    }
  };

  // Buy an extra game (uses entitlements credits)
  $('#extra').onclick = async () => {
    try{
      await API.entitlement_check({
        action: 'simulate_add_game_credit'
      });
      toast('Extra game added to your account.');
      // If user came from create flow, send back to host screen
      if (from === 'create'){
        location.hash = '#/host';
      }
    }catch(e){
      toast(e?.message || 'Failed to add extra game');
    }
  };

  // Subscribe: mark user as subscribed in entitlements
  $('#sub').onclick = async () => {
    try{
      await API.entitlement_check({
        action: 'simulate_subscribe'
      });
      toast('Subscription activated.');

      if (from === 'extend' && code){
        // Host came here to extend an ongoing game
        location.hash = '#/game/' + encodeURIComponent(code);
      }else if (from === 'create'){
        // Host came here because free window blocked create
        location.hash = '#/host';
      }
    }catch(e){
      toast(e?.message || 'Failed to activate subscription');
    }
  };
}
