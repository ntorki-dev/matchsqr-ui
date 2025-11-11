// summary.js
// Summary UI bound to "summary" edge function via api.js:jpost().
// Card: centered title, bold name, compact help text.
// Bottom row inside card: Prev (left) / Next (right), host only, icons 16x16.
// Outside the card (as a sibling): one centered button for "my" action.
//
// Reused helpers: getSession, msPidKey, jpost, resolveGameId from api.js; $, toast from ui.js.
// No schema changes. Future AI: only the edge function changes to return AI blurbs.

import { jpost, getSession, msPidKey, resolveGameId } from './api.js';
import { $, toast } from './ui.js';

// ------------- Local state -------------
let state = null;
let container = null;   // #mainCard
let code = null;
let isHost = false;
let myPid = null;
let view = null;        // { selected_seat, participants[], summaries_short[] }

// ------------- Utilities -------------
function seatIndices(ps){ return (ps||[]).map(p=>p.seat_index); }
function bySeat(ps, seat){ return (ps||[]).find(p=>p.seat_index===seat) || null; }

function displayName(p, sessionUser){
  let name = p?.profile_name || p?.nickname || p?.name || 'Guest';
  if (sessionUser?.id && p?.user_id && String(p.user_id) === String(sessionUser.id)) {
    if (sessionUser?.user_metadata?.name) name = sessionUser.user_metadata.name;
  }
  return name;
}

function resolveMyParticipant(participants, sessionUser){
  if (myPid){
    const hit = participants.find(p => String(p.id)===String(myPid));
    if (hit) return hit;
  }
  try{
    const pid = JSON.parse(sessionStorage.getItem(msPidKey(code)) || 'null') ||
                JSON.parse(localStorage.getItem(msPidKey(code)) || 'null');
    if (pid){
      const hit = participants.find(p => String(p.id)===String(pid));
      if (hit) return hit;
    }
  }catch(_){}
  const hit = participants.find(p => String(p.user_id||'') === String(sessionUser?.id||''));
  return hit || (participants[0] || null);
}

// Resolve the canonical game_id safely before any server call
function getGameId(){
  // prefer explicit state.id if it’s already a UUID
  if (state && state.id) {
    try { return resolveGameId(state.id); } catch(_) {}
  }
  // try resolving from code or other shapes
  try { return resolveGameId(state?.game_id || code || null); } catch(_) {}
  return null;
}

// ------------- Edge calls via jpost -------------
async function fetchView(){
  const gid = getGameId();
  if (!gid){ throw new Error('Missing game id'); }
  return jpost('summary', { action: 'get_view', game_id: gid });
}
async function setSeatOnServer(nextSeat){
  const gid = getGameId();
  if (!gid){ throw new Error('Missing game id'); }
  return jpost('summary', { action: 'select_seat', game_id: gid, seat_index: nextSeat });
}

// ------------- Rendering -------------
function renderCard(){
  const sessionUser = window.__MS_SESSION || null;
  const participants = view?.participants || [];
  const seats = seatIndices(participants);

  if (!seats.length){
    container.innerHTML =
      '<div class="inline-actions"><h3 style="text-align:center">Game Summary</h3></div>' +
      '<p class="help">No participants found.</p>';
    return;
  }

  const seat = Number(view?.selected_seat ?? seats[0]);
  const current = bySeat(participants, seat) || participants[0];
  const name = displayName(current, sessionUser);

  // Prefer server-provided short blurbs; fallback minimal local pool
  let shortText = null;
  if (Array.isArray(view?.summaries_short)){
    const row = view.summaries_short.find(r => String(r.participant_id)===String(current.id));
    shortText = row?.summary_short || null;
  }
  if (!shortText){
    const pool = [
      "You connected deeply with others and listened with care.",
      "You reflected on each question and gave thoughtful answers.",
      "You brought energy, humor, and curiosity to the group.",
      "You kept things grounded and practical throughout the game."
    ];
    const i = Math.max(0, seats.indexOf(current.seat_index));
    shortText = pool[i % pool.length];
  }

  const nav = isHost
    ? ('<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">'
        + '<a id="msPrev" class="help" href="#"><img src="./assets/previous.png" width="16" height="16" alt="Previous"/> Previous</a>'
        + '<a id="msNext" class="help" href="#">Next <img src="./assets/forward.png" width="16" height="16" alt="Next"/></a>'
      + '</div>')
    : '';

  container.innerHTML =
    '<div class="inline-actions"><h3 style="text-align:center">Game Summary</h3></div>'
    + '<p><strong>'+ name +'</strong></p>'
    + '<p class="help" style="margin-top:6px;margin-bottom:0">'+ shortText +'</p>'
    + nav;

  if (isHost){
    const prev = $('#msPrev');
    const next = $('#msNext');
    if (prev) prev.onclick = async e=>{
      e.preventDefault();
      const i = Math.max(0, seats.indexOf(seat));
      const ns = seats[(i-1+seats.length)%seats.length];
      try{
        await setSeatOnServer(ns);
        view.selected_seat = ns;
        renderCard();
      }catch(err){ toast(err.message || 'Failed'); }
    };
    if (next) next.onclick = async e=>{
      e.preventDefault();
      const i = Math.max(0, seats.indexOf(seat));
      const ns = seats[(i+1)%seats.length];
      try{
        await setSeatOnServer(ns);
        view.selected_seat = ns;
        renderCard();
      }catch(err){ toast(err.message || 'Failed'); }
    };
  }
}

// One centered action button UNDER the card (sibling after #mainCard)
function renderActionBar(){
  const root = document.getElementById('roomMain') || container?.parentElement;
  if (!root) return;
  let bar = document.getElementById('summaryActionBar');
  if (!bar){
    bar = document.createElement('div');
    bar.id = 'summaryActionBar';
    bar.className = 'inline-actions';
    bar.style.marginTop = '12px';
    if (container && container.parentElement){
      container.parentElement.insertBefore(bar, container.nextSibling);
    }else{
      root.appendChild(bar);
    }
  }

  const sessionUser = window.__MS_SESSION || null;
  const isLoggedIn = !!(sessionUser && sessionUser.id);

  if (isLoggedIn){
    bar.innerHTML = '<button id="msFullReport" class="btn">Get my full report</button>';
    const btn = $('#msFullReport');
    if (btn) btn.onclick = async ()=>{
      try{
        const mine = resolveMyParticipant(view?.participants||[], sessionUser);
        const pid = mine?.id || myPid || null;
        if (!pid) { toast('No participant found'); return; }
        await jpost('email_full_report', { game_id: getGameId(), participant_id: pid });
        toast('Report will be emailed to you');
      }catch(_){ toast('Report request received'); }
    };
  }else{
    bar.innerHTML =
      '<div>'
        + '<p class="help" style="margin-bottom:6px;text-align:center">Please register below in the next 30 minutes to get a full report.</p>'
        + '<div class="inline-actions"><button id="msRegister" class="btn">Register</button></div>'
      + '</div>';
    const btn = $('#msRegister');
    if (btn) btn.onclick = ()=>{
      try{
        const mine = resolveMyParticipant(view?.participants||[], window.__MS_SESSION || null);
        const pid = mine?.id || myPid || null;
        localStorage.setItem('ms_attach_payload', JSON.stringify({
          game_id: getGameId(),
          temp_player_id: pid
        }));
      }catch(_){}
      try{ location.hash = '#/register'; }catch(_){}
    };
  }
}

// ------------- Public API -------------
export async function mount(opts){
  state = opts?.state || null;
  container = opts?.container || null;
  code = opts?.code || null;
  isHost = !!opts?.isHost;

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

  const gid = getGameId();
  if (!gid){
    container.innerHTML =
      '<div class="inline-actions"><h3 style="text-align:center">Game Summary</h3></div>' +
      '<p class="help">Missing game id.</p>';
    return;
  }

  view = await fetchView();
  renderCard();
  renderActionBar();

  // Future AI: only update the edge function to emit AI blurbs; UI will pick them up.
}

export async function update(opts){
  if (opts && 'state' in opts) state = opts.state;
  if (opts && 'isHost' in opts) isHost = !!opts.isHost;

  const gid = getGameId();
  if (!gid) return; // avoid bad_request loops

  view = await fetchView();
  renderCard();
  renderActionBar();
}

export function unmount(){
  try{
    const bar = document.getElementById('summaryActionBar');
    if (bar && bar.parentElement) bar.parentElement.removeChild(bar);
  }catch(_){}
  if (container) container.innerHTML = '';
  state = null;
  container = null;
  code = null;
  isHost = false;
  myPid = null;
  view = null;
}
