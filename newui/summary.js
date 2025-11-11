// summary.js
// Uses participants from game.js state; edge function only stores/reads selected seat.
// Layout:
//  - inside card: centered title, bold name, help text, guest note (if logged out), nav row at bottom (host only)
//  - below the card (same column): one centered action button (register or "Get my full report")

import { jpost, getSession, msPidKey, resolveGameId } from './api.js';
import { $, toast } from './ui.js';

// ---------- module state ----------
let state = null;
let container = null;   // #mainCard (center column card)
let code = null;
let isHost = false;
let myPid = null;
let selectedSeat = null;

// ---------- helpers ----------
function seats(){ return Array.isArray(state?.participants) ? state.participants.map(p=>p.seat_index) : []; }
function bySeat(seat){
  const list = Array.isArray(state?.participants) ? state.participants : [];
  return list.find(p => Number(p.seat_index) === Number(seat)) || null;
}
function meFrom(sessionUser){
  // pid from storage
  try{
    const pid = myPid || JSON.parse(sessionStorage.getItem(msPidKey(code)) || 'null') ||
                 JSON.parse(localStorage.getItem(msPidKey(code)) || 'null');
    if (pid){
      const hit = (state?.participants||[]).find(p => String(p.id||p.participant_id) === String(pid));
      if (hit) return hit;
    }
  }catch(_){}
  // match by user id
  if (sessionUser?.id){
    const hit = (state?.participants||[]).find(p => String(p.user_id||'') === String(sessionUser.id));
    if (hit) return hit;
  }
  // fallback
  return (state?.participants && state.participants[0]) || null;
}
function displayName(p, sessionUser){
  let name = p?.profile_name || p?.nickname || p?.name || 'Guest';
  if (sessionUser?.id && p?.user_id && String(p.user_id) === String(sessionUser.id)){
    if (sessionUser?.user_metadata?.name) name = sessionUser.user_metadata.name;
  }
  return name;
}
function shortSummaryForSeat(seatIndex){
  const pool = [
    "You connected deeply with others and listened with care.",
    "You reflected on each question and gave thoughtful answers.",
    "You brought energy, humor, and curiosity to the group.",
    "You kept things grounded and practical throughout the game.",
    "You looked for bright angles and encouraged others.",
    "You compared tradeoffs and explained your reasoning clearly.",
    "You used vivid examples and personal stories.",
    "You asked sharp questions that opened new ideas."
  ];
  const i = Math.abs(Number(seatIndex||0)) % pool.length;
  return pool[i];
}
function gid(){ return resolveGameId(state?.id || null); }

// ---------- edge calls: seat only ----------
async function getSelectedSeat(){
  const out = await jpost('summary', { action:'get_selected', game_id: gid() });
  return (out && typeof out.selected_seat === 'number') ? out.selected_seat : null;
}
async function setSelectedSeat(seat){
  return jpost('summary', { action:'set_selected', game_id: gid(), seat_index: seat });
}

// ---------- render ----------
function renderCard(){
  const seatList = seats();
  if (!seatList.length){
    container.innerHTML =
      '<div class="inline-actions"><h3 style="text-align:center;width:100%;">Game Summary</h3></div>' +
      '<p class="help">No participants found.</p>';
    return;
  }

  const sessionUser = window.__MS_SESSION || null;
  const seat = (typeof selectedSeat === 'number') ? selectedSeat : seatList[0];
  const current = bySeat(seat) || bySeat(seatList[0]);
  const name = displayName(current, sessionUser);
  const text = shortSummaryForSeat(current?.seat_index);
  const isLoggedIn = !!(sessionUser && sessionUser.id);

  const guestNote = isLoggedIn
    ? ''
    : '<p class="help" style="margin:10px 0 0 0">Please register below in the next 30 minutes to get a full report.</p>';

  const nav = isHost
    ? ('<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;">' +
         '<a id="msPrev" class="help" href="#"><img src="./assets/previous.png" width="16" height="16" alt="Previous"/> Previous</a>' +
         '<a id="msNext" class="help" href="#">Next <img src="./assets/forward.png" width="16" height="16" alt="Next"/></a>' +
       '</div>')
    : '';

  container.innerHTML =
    '<div class="inline-actions"><h3 style="text-align:center;width:100%;">Game Summary</h3></div>' +
    '<p><strong>' + name + '</strong></p>' +
    '<p class="help" style="margin-top:6px;margin-bottom:0">' + text + '</p>' +
    guestNote +
    nav;

  if (isHost){
    const prev = $('#msPrev');
    const next = $('#msNext');
    if (prev) prev.onclick = async (e)=>{
      e.preventDefault();
      const i = Math.max(0, seatList.indexOf(seat));
      const ns = seatList[(i-1+seatList.length)%seatList.length];
      try{
        await setSelectedSeat(ns);
        selectedSeat = ns;
        renderCard();
      }catch(err){
        toast('Only the host can change the shown player.');
      }
    };
    if (next) next.onclick = async (e)=>{
      e.preventDefault();
      const i = Math.max(0, seatList.indexOf(seat));
      const ns = seatList[(i+1)%seatList.length];
      try{
        await setSelectedSeat(ns);
        selectedSeat = ns;
        renderCard();
      }catch(err){
        toast('Only the host can change the shown player.');
      }
    };
  }
}

// below-card single action button (same column as the card)
function renderActionBar(){
  if (!container) return;
  const parent = container.parentElement; // this is the middle column wrapper
  if (!parent) return;

  let bar = document.getElementById('summaryActionBar');
  if (!bar){
    bar = document.createElement('div');
    bar.id = 'summaryActionBar';
    bar.className = 'inline-actions';
    // force it to be a full-width row under the card
    bar.style.display = 'flex';
    bar.style.justifyContent = 'center';
    bar.style.width = '100%';
    bar.style.marginTop = '12px';
    parent.insertBefore(bar, container.nextSibling);
  }

  const sessionUser = window.__MS_SESSION || null;
  const isLoggedIn = !!(sessionUser && sessionUser.id);

  if (isLoggedIn){
    bar.innerHTML = '<button id="msFullReport" class="btn">Get my full report</button>';
    const btn = $('#msFullReport');
    if (btn) btn.onclick = async ()=>{
      try{
        const mine = meFrom(sessionUser);
        const pid = mine?.id || mine?.participant_id || myPid || null;
        if (!pid){ toast('No participant found'); return; }
        await jpost('email_full_report', { game_id: gid(), participant_id: pid });
        toast('Report will be emailed to you');
      }catch(_){ toast('Report request received'); }
    };
  }else{
    bar.innerHTML = '<button id="msRegister" class="btn">Register</button>';
    const btn = $('#msRegister');
    if (btn) btn.onclick = ()=>{
      try{
        const mine = meFrom(window.__MS_SESSION || null);
        const pid = mine?.id || mine?.participant_id || myPid || null;
        localStorage.setItem('ms_attach_payload', JSON.stringify({
          game_id: gid(),
          temp_player_id: pid
        }));
      }catch(_){}
      try{ location.hash = '#/register'; }catch(_){}
    };
  }
}

// ---------- public API ----------
export async function mount(opts){
  state = opts?.state || null;
  container = opts?.container || null;
  code = opts?.code || null;
  isHost = !!opts?.isHost;
  selectedSeat = (typeof opts?.selectedSeat === 'number') ? opts.selectedSeat : null;

  myPid = opts?.myPid || null;
  if (!myPid && code){
    try{
      myPid = JSON.parse(sessionStorage.getItem(msPidKey(code)) || 'null') ||
              JSON.parse(localStorage.getItem(msPidKey(code)) || 'null');
    }catch(_){}
  }

  try{
    const s = await getSession();
    window.__MS_SESSION = s?.user || null;
  }catch(_){ window.__MS_SESSION = null; }

  try{
    const sv = await getSelectedSeat();
    if (typeof sv === 'number') selectedSeat = sv;
  }catch(_){}

  renderCard();
  renderActionBar();
}

export async function update(opts){
  if (opts && 'state' in opts) state = opts.state;
  if (opts && 'isHost' in opts) isHost = !!opts.isHost;

  try{
    const sv = await getSelectedSeat();
    if (typeof sv === 'number') selectedSeat = sv;
  }catch(_){}

  renderCard();
  renderActionBar();
}

export function unmount(){
  try{
    const bar = document.getElementById('summaryActionBar');
    if (bar && bar.parentElement) bar.parentElement.removeChild(bar);
  }catch(_){}
  if (container) container.innerHTML = '';
  state = null; container = null; code = null; isHost = false; myPid = null; selectedSeat = null;
}
