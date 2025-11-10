// summary.js
// Summary parade without realtime dependency.
// Uses only existing classes from app.css. No new CSS.

import { jpost, getSession, resolveGameId, msPidKey } from './api.js';
import { $, toast } from './ui.js';

// Module state
let state = null;
let container = null;
let selectedSeat = null;   // which seat is shown on this viewer
let code = null;
let myPid = null;          // viewer participant id/temp id
let isHost = false;

// Local persistence for host selection to avoid flicker on polling
function selKey(c){ return 'ms_summary_selected_' + String(c||''); }
function loadSelected(c){
  try{ const v = localStorage.getItem(selKey(c)); if (v!=null) return Number(v); }catch(_){}
  return null;
}
function saveSelected(c, seat){
  try{ localStorage.setItem(selKey(c), String(seat)); }catch(_){}
}

// Static summaries for MVP
const STATIC_SUMMARIES = [
  { title: 'The Empath',      text: 'You connected deeply with others and listened with care.' },
  { title: 'The Thinker',     text: 'You reflected on each question and gave thoughtful answers.' },
  { title: 'The Adventurer',  text: 'You brought energy, humor, and curiosity to the group.' },
  { title: 'The Realist',     text: 'You kept things grounded and practical throughout the game.' },
  { title: 'The Optimist',    text: 'You looked for bright angles and encouraged others.' },
  { title: 'The Analyst',     text: 'You compared tradeoffs and explained your reasoning clearly.' },
  { title: 'The Storyteller', text: 'You used vivid examples and personal stories.' },
  { title: 'The Challenger',  text: 'You asked sharp questions that opened new ideas.' }
];

function pickStaticSummary(idx){
  const list = STATIC_SUMMARIES;
  if (!Array.isArray(list) || !list.length) return { title:'Summary', text:'Thanks for playing.' };
  const i = Math.abs(Number(idx || 0)) % list.length;
  return list[i];
}

function seatsSorted(participants){
  const ps = Array.isArray(participants) ? participants.slice() : [];
  return ps
    .filter(p => typeof p?.seat_index === 'number')
    .sort((a,b)=>a.seat_index - b.seat_index);
}

function displayName(p, sessionUser){
  const uid = p?.user_id || p?.auth_user_id || p?.owner_id || p?.userId || p?.uid || '';
  let name = p?.profile_name || p?.nickname || p?.name || 'Guest';
  const emailName = (sessionUser?.email || '').split('@')[0] || null;
  const isMe = !!(sessionUser && (
    (uid && String(uid) === String(sessionUser.id || '')) ||
    (emailName && typeof p?.name === 'string' && p.name === emailName)
  ));
  if (isMe && sessionUser?.user_metadata?.name){ name = sessionUser.user_metadata.name; }
  return name;
}

function resolveViewerParticipant(participants, pidCandidate){
  // pidCandidate can be participant_id or tempId (for guests)
  for (const pp of participants){
    const pid   = pp?.participant_id || pp?.id || null;
    const temp  = pp?.tempId || pp?.temp_id || null;
    if ((pid && pidCandidate && String(pid) === String(pidCandidate)) ||
        (temp && pidCandidate && String(temp) === String(pidCandidate))){
      return pp;
    }
  }
  return null;
}

function renderCore(){
  if (!container || !state) return;

  const sessionUser = window.__MS_SESSION || null;
  const isLoggedIn = !!(sessionUser && sessionUser.id);
  const participants = seatsSorted(state.participants || []);

  if (!participants.length){
    container.innerHTML =
      '<div class="inline-actions"><h3>Game Summary</h3></div>' +
      '<p class="help">No participants found.</p>';
    return;
  }

  // Compute seat list
  const seats = participants.map(p => p.seat_index);

  // Determine the viewer participant first
  let viewerP = resolveViewerParticipant(participants, myPid);

  // Selection rules, no realtime:
  // - Host: keep a local selection with persistence so host can parade
  // - Guest: always show the viewer's own seat so their personal panel is visible
  if (isHost){
    if (selectedSeat == null){
      selectedSeat = loadSelected(code);
      if (selectedSeat == null) selectedSeat = seats[0];
    }
  }else{
    // Guest view: force to own seat if known, else fall back to first seat
    selectedSeat = viewerP?.seat_index ?? seats[0];
  }

  const iSel = Math.max(0, seats.indexOf(selectedSeat));
  const current = participants[iSel] || participants[0];
  const currentSeat = current?.seat_index;

  const viewerSeat = viewerP?.seat_index;
  const staticSum = pickStaticSummary(currentSeat);
  const name = displayName(current, sessionUser);

  // Host-only navigation with icons 16x16, as links
  const navHtml = isHost
    ? '<div class="inline-actions">'
        + '<a id="msPrev" class="help" href="#"><img src="./assets/previous.png" alt="Previous" width="16" height="16"/> Previous Player</a>'
        + '<a id="msNext" class="help" href="#">Next Player <img src="./assets/forward.png" alt="Next" width="16" height="16"/></a>'
      + '</div>'
    : '';

  // Action panel only for the displayed participant
  let viewerPanel = '';
  const isViewerTurn = (viewerSeat != null && currentSeat != null && Number(viewerSeat) === Number(currentSeat));
  if (isViewerTurn){
    if (isLoggedIn){
      viewerPanel =
        '<div class="inline-actions">'
          + '<button id="msFullReport" class="btn">Get my full report</button>'
        + '</div>';
    }else{
      viewerPanel =
        '<p class="help">Please register below in the next 30 minutes to get a full report.</p>'
        + '<div class="inline-actions">'
          + '<button id="msRegister" class="btn">Register</button>'
        + '</div>';
    }
  }

  // Compose main card content
  container.innerHTML =
    '<div class="inline-actions"><h3>Game Summary</h3></div>'
    + '<p><strong>'+ name +'</strong></p>'
    + '<p class="help">'+ staticSum.text +'</p>'
    + navHtml
    + viewerPanel;

  // Prev/Next for host only
  const prevBtn = $('#msPrev');
  const nextBtn = $('#msNext');
  if (prevBtn){
    prevBtn.onclick = (evt)=>{
      evt.preventDefault();
      if (!isHost) return;
      try{
        const idx = Math.max(0, seats.indexOf(selectedSeat));
        const nextSeat = seats[(idx - 1 + seats.length) % seats.length];
        selectedSeat = nextSeat;
        saveSelected(code, nextSeat);
        renderCore();
      }catch(e){ toast(e.message || 'Failed'); }
    };
  }
  if (nextBtn){
    nextBtn.onclick = (evt)=>{
      evt.preventDefault();
      if (!isHost) return;
      try{
        const idx = Math.max(0, seats.indexOf(selectedSeat));
        const nextSeat = seats[(idx + 1) % seats.length];
        selectedSeat = nextSeat;
        saveSelected(code, nextSeat);
        renderCore();
      }catch(e){ toast(e.message || 'Failed'); }
    };
  }

  // Register
  const regBtn = $('#msRegister');
  if (regBtn){
    regBtn.onclick = ()=>{
      try{
        localStorage.setItem('ms_attach_payload', JSON.stringify({
          game_id: state.id,
          temp_player_id: myPid || null
        }));
      }catch(_){}
      try{ location.hash = '#/register'; }catch(_){}
    };
  }

  // Full report
  const fullBtn = $('#msFullReport');
  if (fullBtn){
    fullBtn.onclick = async()=>{
      try{
        const gid = resolveGameId(state.id);
        await jpost('email_full_report', { game_id: gid, participant_id: myPid });
        toast('Report will be emailed to you');
      }catch(_){
        toast('Report request received');
      }
    };
  }
}

// Public API
export function mount(opts){
  state = opts?.state || null;
  container = opts?.container || null;
  selectedSeat = opts?.selectedSeat ?? null; // host may pass first seat
  code = opts?.code || null;

  // myPid from caller or storage, covers guests
  myPid = opts?.myPid || null;
  if (!myPid && code){
    try {
      myPid = JSON.parse(sessionStorage.getItem(msPidKey(code)) || 'null');
      if (!myPid) myPid = JSON.parse(localStorage.getItem(msPidKey(code)) || 'null');
    } catch(_){ myPid = null; }
  }

  isHost = !!opts?.isHost;

  // Cache session for display names, then render once
  getSession()
    .then(s => { window.__MS_SESSION = s?.user || null; renderCore(); })
    .catch(() => renderCore());
}

export function update(opts){
  if (opts && 'state' in opts) state = opts.state;
  if (opts && 'selectedSeat' in opts) selectedSeat = opts.selectedSeat; // host can still pass first seat
  if (opts && 'isHost' in opts) isHost = !!opts.isHost;
  renderCore();
}

export function unmount(){
  if (container) container.innerHTML = '';
  state = null;
  container = null;
  selectedSeat = null;
  code = null;
  myPid = null;
  isHost = false;
}
