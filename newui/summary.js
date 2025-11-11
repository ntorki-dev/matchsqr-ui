// summary.js
// Summary UI with host-controlled selection via summary_index edge function.
// - Card shows: centered title, bold name, compact help text.
// - Prev/Next at bottom of card (left/right, 16x16 icons), host only.
// - A single centered action button UNDER the card (sibling), not inside it.
// - The button acts "for me": if logged in -> call existing email_full_report_index;
//   if not -> save ms_attach_payload and route to #/register.
// - Future AI path documented below; no code left in place that isn't used now.

import { jpost, getSession, msPidKey } from './api.js';
import { $, toast } from './ui.js';

// ------------- State -------------
let state = null;
let container = null;     // #mainCard
let code = null;
let isHost = false;
let myPid = null;
let view = null;          // { selected_seat, participants[], summaries_short[] }

// ------------- Helpers -------------
function seatIndices(ps){ return (ps||[]).map(p=>p.seat_index); }
function bySeat(ps, seat){ return (ps||[]).find(p=>p.seat_index===seat) || null; }

function displayName(p, sessionUser){
  let name = p?.profile_name || p?.nickname || p?.name || 'Guest';
  if (sessionUser?.id && p?.user_id && String(p.user_id) === String(sessionUser.id)) {
    if (sessionUser?.user_metadata?.name) name = sessionUser.user_metadata.name;
  }
  return name;
}

// Resolve my participant at click time so the action is always "for me"
function resolveMyParticipant(participants, sessionUser){
  // 1) cached myPid
  if (myPid){
    const hit = participants.find(p => String(p.id)===String(myPid));
    if (hit) return hit;
  }
  // 2) storage
  try{
    const pid = JSON.parse(sessionStorage.getItem(msPidKey(code)) || 'null') ||
                JSON.parse(localStorage.getItem(msPidKey(code)) || 'null');
    if (pid){
      const hit = participants.find(p => String(p.id)===String(pid));
      if (hit) return hit;
    }
  }catch(_){}
  // 3) by user id
  const hit = participants.find(p => String(p.user_id||'')===String(sessionUser?.id||'')); 
  return hit || (participants[0] || null);
}

// Edge calls
async function fetchView(gameId){
  return jpost('summary', { action: 'get_view', game_id: gameId });
}
async function setSeatOnServer(gameId, seat){
  try{ await jpost('summary', { action: 'select_seat', game_id: gameId, seat_index: seat }); }
  catch(_){}
}

// ------------- Rendering -------------
function renderCard(){
  const sessionUser = window.__MS_SESSION || null;
  const participants = view?.participants || [];
  const seats = seatIndices(participants);

  if (!seats.length){
    container.innerHTML = '<div class="inline-actions"><h3 style="text-align:center">Game Summary</h3></div><p class="help">No participants found.</p>';
    return;
  }

  const seat = Number(view?.selected_seat ?? seats[0]);
  const current = bySeat(participants, seat) || participants[0];
  const name = displayName(current, sessionUser);

  // Prefer server-provided short blurbs (future AI-ready)
  let shortText = null;
  if (Array.isArray(view?.summaries_short)){
    const row = view.summaries_short.find(r => String(r.participant_id)===String(current.id));
    shortText = row?.summary_short || null;
  }
  if (!shortText){
    // Minimal fallback pool to keep file self-contained
    const pool = [
      "You connected deeply with others and listened with care.",
      "You reflected on each question and gave thoughtful answers.",
      "You brought energy, humor, and curiosity to the group.",
      "You kept things grounded and practical throughout the game."
    ];
    const i = Math.max(0, seats.indexOf(current.seat_index));
    shortText = pool[i % pool.length];
  }

  // Prev/Next row at bottom of card (host only)
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

  // Wire host navigation
  if (isHost){
    const prev = $('#msPrev');
    const next = $('#msNext');
    if (prev) prev.onclick = async e=>{
      e.preventDefault();
      const i = Math.max(0, seats.indexOf(seat));
      const ns = seats[(i-1+seats.length)%seats.length];
      await setSeatOnServer(state.id, ns);
      view.selected_seat = ns;
      renderCard();
    };
    if (next) next.onclick = async e=>{
      e.preventDefault();
      const i = Math.max(0, seats.indexOf(seat));
      const ns = seats[(i+1)%seats.length];
      await setSeatOnServer(state.id, ns);
      view.selected_seat = ns;
      renderCard();
    };
  }
}

// Single centered action button UNDER the card (sibling of #mainCard)
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
        await jpost('email_full_report', { game_id: state.id, participant_id: pid });
        toast('Report will be emailed to you');
      }catch(_){
        toast('Report request received');
      }
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
        const sessionUser = window.__MS_SESSION || null;
        const mine = resolveMyParticipant(view?.participants||[], sessionUser);
        const pid = mine?.id || myPid || null;
        localStorage.setItem('ms_attach_payload', JSON.stringify({
          game_id: state.id,
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
  }catch(_){}

  view = await fetchView(state.id);
  renderCard();
  renderActionBar();

  // Future AI switch (docs):
  // - When ai_summaries are populated, adjust the edge function's get_view to prefer AI rows.
  // - This UI will automatically display AI blurbs from view.summaries_short without changes here.
}

export async function update(opts){
  if (opts && 'state' in opts) state = opts.state;
  if (opts && 'isHost' in opts) isHost = !!opts.isHost;

  view = await fetchView(state.id);
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
