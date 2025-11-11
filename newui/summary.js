// summary.js
// Uses participants from game.js (state.participants with seat_index).
// Backend is used only to read/write the selected seat for sync.
// Layout: title centered; name bold; help text; guest sentence inside card;
// nav row at bottom (host only); one centered button BELOW the card.

import { jpost, getSession, msPidKey, resolveGameId } from './api.js';
import { $, toast } from './ui.js';

// ---------- module state ----------
let state = null;
let container = null;
let code = null;
let isHost = false;
let myPid = null;

// cache of server-selected seat
let selectedSeat = null;

// ---------- small utils ----------
function seatsFromState(){ return Array.isArray(state?.participants) ? state.participants.map(p=>p.seat_index) : []; }
function participantBySeat(seat){
  const list = Array.isArray(state?.participants) ? state.participants : [];
  return list.find(p => Number(p.seat_index) === Number(seat)) || null;
}
function displayName(p, sessionUser){
  let name = p?.profile_name || p?.nickname || p?.name || 'Guest';
  if (sessionUser?.id && p?.user_id && String(p.user_id) === String(sessionUser.id)){
    if (sessionUser?.user_metadata?.name) name = sessionUser.user_metadata.name;
  }
  return name;
}
function resolveMine(sessionUser){
  // 1) stored pid
  try{
    const pid = myPid || JSON.parse(sessionStorage.getItem(msPidKey(code)) || 'null') ||
                 JSON.parse(localStorage.getItem(msPidKey(code)) || 'null');
    if (pid){
      const hit = (state?.participants||[]).find(p => String(p.id||p.participant_id) === String(pid));
      if (hit) return hit;
    }
  }catch(_){}
  // 2) by user id
  if (sessionUser?.id){
    const hit = (state?.participants||[]).find(p => String(p.user_id||'') === String(sessionUser.id));
    if (hit) return hit;
  }
  // 3) fallback first
  return (state?.participants && state.participants[0]) || null;
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

// ---------- backend calls (seat only) ----------
async function getSelectedSeat(){
  const gid = resolveGameId(state?.id || null);
  const out = await jpost('summary', { action:'get_selected', game_id: gid });
  const sv = (out && typeof out.selected_seat === 'number') ? out.selected_seat : null;
  return sv;
}
async function setSelectedSeat(seat){
  const gid = resolveGameId(state?.id || null);
  await jpost('summary', { action:'set_selected', game_id: gid, seat_index: seat });
}

// ---------- render ----------
function renderCard(){
  const seats = seatsFromState();
  if (!seats.length){
    container.innerHTML =
      '<div class="inline-actions"><h3 style="text-align:center">Game Summary</h3></div>' +
      '<p class="help">No participants found.</p>';
    return;
  }

  const sessionUser = window.__MS_SESSION || null;
  const seat = (typeof selectedSeat === 'number') ? selectedSeat : seats[0];
  const current = participantBySeat(seat) || participantBySeat(seats[0]);
  const name = displayName(current, sessionUser);
  const text = shortSummaryForSeat(current?.seat_index);

  // inside-card guest note (only when logged out)
  const isLoggedIn = !!(sessionUser && sessionUser.id);
  const guestNote = isLoggedIn
    ? ''
    : '<p class="help" style="margin:10px 0 0 0">Please register below in the next 30 minutes to get a full report.</p>';

  const nav = isHost
    ? ('<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">' +
         '<a id="msPrev" class="help" href="#"><img src="./assets/previous.png" width="16" height="16" alt="Previous"/> Previous</a>' +
         '<a id="msNext" class="help" href="#">Next <img src="./assets/forward.png" width="16" height="16" alt="Next"/></a>' +
       '</div>')
    : '';

  container.innerHTML =
    '<div class="inline-actions"><h3 style="text-align:center">Game Summary</h3></div>' +
    '<p><strong>' + name + '</strong></p>' +
    '<p class="help" style="margin-top:6px;margin-bottom:0">' + text + '</p>' +
    guestNote +
    nav;

  if (isHost){
    const prev = $('#msPrev');
    const next = $('#msNext');
    if (prev) prev.onclick = async (e)=>{
      e.preventDefault();
      const i = Math.max(0, seats.indexOf(seat));
      const ns = seats[(i-1+seats.length)%seats.length];
      try{ await setSelectedSeat(ns); selectedSeat = ns; renderCard(); }catch(e){ toast(e.message||'Failed'); }
    };
    if (next) next.onclick = async (e)=>{
      e.preventDefault();
      const i = Math.max(0, seats.indexOf(seat));
      const ns = seats[(i+1)%seats.length];
      try{ await setSelectedSeat(ns); selectedSeat = ns; renderCard(); }catch(e){ toast(e.message||'Failed'); }
    };
  }
}

// Single centered action button BELOW the card (sibling after #mainCard)
function renderActionBar(){
  const roomMain = document.getElementById('roomMain');
  if (!roomMain || !container) return;

  let bar = document.getElementById('summaryActionBar');
  if (!bar){
    bar = document.createElement('div');
    bar.id = 'summaryActionBar';
    bar.className = 'inline-actions';
    bar.style.display = 'flex';
    bar.style.justifyContent = 'center';
    bar.style.width = '100%';
    bar.style.marginTop = '12px';
    // insert immediately after the main card without touching side columns
    if (container.nextSibling){
      roomMain.insertBefore(bar, container.nextSibling);
    }else{
      roomMain.appendChild(bar);
    }
  }

  const sessionUser = window.__MS_SESSION || null;
  const isLoggedIn = !!(sessionUser && sessionUser.id);

  if (isLoggedIn){
    bar.innerHTML = '<button id="msFullReport" class="btn">Get my full report</button>';
    const btn = $('#msFullReport');
    if (btn) btn.onclick = async ()=>{
      try{
        const mine = resolveMine(sessionUser);
        const pid = mine?.id || mine?.participant_id || myPid || null;
        if (!pid){ toast('No participant found'); return; }
        await jpost('email_full_report', { game_id: resolveGameId(state?.id||null), participant_id: pid });
        toast('Report will be emailed to you');
      }catch(_){ toast('Report request received'); }
    };
  }else{
    bar.innerHTML = '<button id="msRegister" class="btn">Register</button>';
    const btn = $('#msRegister');
    if (btn) btn.onclick = ()=>{
      try{
        const mine = resolveMine(window.__MS_SESSION || null);
        const pid = mine?.id || mine?.participant_id || myPid || null;
        localStorage.setItem('ms_attach_payload', JSON.stringify({
          game_id: resolveGameId(state?.id||null),
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
  container = opts?.container || null;  // #mainCard
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

  // Read server-selected seat if present; if null keep the passed default
  try{
    const sv = await getSelectedSeat();
    if (typeof sv === 'number') selectedSeat = sv;
  }catch(_){} // ignore and use local default

  renderCard();
  renderActionBar();
}

export async function update(opts){
  if (opts && 'state' in opts) state = opts.state;
  if (opts && 'isHost' in opts) isHost = !!opts.isHost;

  // Refresh current selected seat from server so all follow the host
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
