/* app.js — drop-in replacement (identity + presence + leave beacons) */
(function(){
  const els = {
    joinRoomBtn: document.getElementById('joinRoomBtn'),
    joinCode: document.getElementById('joinCode'),
    guestName: document.getElementById('guestName'),
  };
  const cfg = window.CONFIG || {};
  const base = cfg.FUNCTIONS_BASE || '';
  const state = { gameId: null, code: null, role: 'guest' };

  function getPid(code){ try{ return localStorage.getItem('ms_pid_'+code) || null; }catch{ return null; } }
  function setPid(code,id){ try{ if(code && id) localStorage.setItem('ms_pid_'+code, id); }catch{} }

  async function join(code, name, role){
    const prior = getPid(code);
    const body = prior ? { code, name, participant_id: prior, role } : { code, name, role };
    const r = await fetch(base + '/join_game_guest', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify(body) });
    const out = await r.json().catch(()=>({}));
    if(out?.participant_id){ setPid(code, out.participant_id); }
    if(out?.game_id){ state.gameId = out.game_id; state.code = code; state.role = role||'guest'; }
    return out;
  }

  function startHeartbeats(){
    // Host
    setInterval(()=>{
      if(!state.gameId) return;
      const pid = getPid(state.code);
      const body = pid ? { gameId: state.gameId, participant_id: pid } : { gameId: state.gameId };
      fetch(base + '/heartbeat', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify(body) }).catch(()=>{});
    }, 25000);

    // Guest
    setInterval(()=>{
      if(!state.gameId) return;
      const pid = getPid(state.code);
      if (pid) {
        fetch(base + '/participant_heartbeat', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ participant_id: pid }) }).catch(()=>{});
      } else if (state.role !== 'host') {
        const name = (els.guestName?.value||'').trim();
        fetch(base + '/participant_heartbeat', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ gameId: state.gameId, name }) }).catch(()=>{});
      }
    }, 25000);
  }

  function installLeaveBeacons(){
    function sendLeave(){
      const pid = getPid(state.code);
      if (state.role === 'host') {
        const body = pid ? { gameId: state.gameId, participant_id: pid, leave: true } : { gameId: state.gameId, leave: true };
        navigator.sendBeacon(base + '/heartbeat', JSON.stringify(body));
      } else {
        const name = (els.guestName?.value||'').trim();
        const body = pid ? { participant_id: pid, leave: true } : { gameId: state.gameId, name, leave: true };
        navigator.sendBeacon(base + '/participant_heartbeat', JSON.stringify(body));
      }
    }
    window.addEventListener('pagehide', sendLeave);
    window.addEventListener('beforeunload', sendLeave);
  }

  if (els.joinRoomBtn) {
    els.joinRoomBtn.addEventListener('click', async ()=>{
      const code = (els.joinCode?.value||'').trim();
      const name = (els.guestName?.value||'').trim();
      const isHost = !!document.querySelector('[data-role="host"][aria-pressed="true"]');
      const role = isHost ? 'host' : 'guest';
      const out = await join(code, name, role);
      startHeartbeats();
      installLeaveBeacons();
      // Existing UI polling of /get_state remains unchanged
    });
  }
})();
