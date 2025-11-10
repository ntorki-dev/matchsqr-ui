// summary.js
// Renders the Summary parade and per-viewer action panel.
// Reuses existing CSS classes from app.css. No new styles are introduced.

import { jpost, getSession, resolveGameId } from './api.js';
import { $, toast } from './ui.js';

let state = null;
let container = null;
let selectedSeat = null;
let code = null;
let myPid = null;
let isHost = false;

// Local persistence for selection so polling doesn't reset it
function selKey(c){ return 'ms_summary_selected_' + String(c||''); }
function loadSelected(c){
  try{ const v = localStorage.getItem(selKey(c)); if (v!=null) return Number(v); }catch(_){}
  return null;
}
function saveSelected(c, seat){
  try{ localStorage.setItem(selKey(c), String(seat)); }catch(_){}
}

// Temporary static summaries for MVP
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
  if (!Array.isArray(list) || list.length === 0){
    return { title: 'Summary', text: 'Thanks for playing.' };
  }
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

function renderCore(){
  if (!container || !state) return;
  const sessionUser = window.__MS_SESSION || null;
  const isLoggedIn = !!(sessionUser && sessionUser.id);
  const participants = seatsSorted(state.participants || []);

  if (!participants.length){
    container.innerHTML = '<div class="inline-actions"><h3>Game Summary</h3></div><p class="help">No participants found.</p>';
    return;
  }

  // Determine selected seat
  const seats = participants.map(p => p.seat_index);
  if (selectedSeat == null){
    selectedSeat = loadSelected(code);
    if (selectedSeat == null) selectedSeat = seats[0];
  }
  const idx = seats.indexOf(selectedSeat);
  const current = participants[Math.max(0, idx)] || participants[0];
  const currentSeat = current?.seat_index;
  const currentPid = current?.participant_id || current?.id || null;

  // Determine viewer participant to enforce button visibility
  let viewerP = null;
  for (const pp of participants){
    const pid = pp?.participant_id || pp?.id || null;
    if (pid && myPid && String(pid) === String(myPid)){ viewerP = pp; break; }
  }
  const viewerSeat = viewerP?.seat_index;

  const staticSum = pickStaticSummary(currentSeat);
  const name = displayName(current, sessionUser);

  // Host-only navigation
  const navHtml = isHost ? (
    '<div class="inline-actions">'+
      '<a id="msPrev" class="help"><img src="./assets/previous.png" alt="Previous"/> Previous Player</a>'+
      '<a id="msNext" class="help">Next Player <img src="./assets/forward.png" alt="Next"/></a>'+
    '</div>'
  ) : '';

  // Per-viewer panel, only for the displayed participant
  let viewerPanel = '';
  if (viewerSeat != null && currentSeat != null && Number(viewerSeat) === Number(currentSeat)){
    if (isLoggedIn){
      viewerPanel =
        '<div class="inline-actions">'+
          '<button id="msFullReport" class="btn">Get my full report</button>'+
        '</div>';
    }else{
      viewerPanel =
        '<p class="help">Please register below in the next 30 minutes to get a full report.</p>'+
        '<div class="inline-actions">'+
          '<button id="msRegister" class="btn">Register</button>'+
        '</div>';
    }
  }

  // Compose
  container.innerHTML =
    '<div class="inline-actions"><h3>Game Summary</h3></div>'+
    '<p><strong>'+ name +'</strong></p>'+
    '<p class="help">'+ staticSum.text +'</p>'+
    navHtml +
    viewerPanel;

  // Wire navigation
  const prevBtn = $('#msPrev');
  const nextBtn = $('#msNext');
  if (prevBtn){
    prevBtn.onclick = (evt)=>{
      evt.preventDefault();
      try{
        const i = Math.max(0, seats.indexOf(selectedSeat));
        const next = seats[(i - 1 + seats.length) % seats.length];
        selectedSeat = next;
        saveSelected(code, next);
        renderCore();
      }catch(e){ toast(e.message || 'Failed'); }
    };
  }
  if (nextBtn){
    nextBtn.onclick = (evt)=>{
      evt.preventDefault();
      try{
        const i = Math.max(0, seats.indexOf(selectedSeat));
        const next = seats[(i + 1) % seats.length];
        selectedSeat = next;
        saveSelected(code, next);
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

export function mount(opts){
  state = opts?.state || null;
  container = opts?.container || null;
  selectedSeat = opts?.selectedSeat ?? null;
  code = opts?.code || null;
  myPid = opts?.myPid || null;
  isHost = !!opts?.isHost;

  // Cache session for display names, then render
  getSession().then(s=>{
    window.__MS_SESSION = s?.user || null;
    renderCore();
  }).catch(()=>renderCore());
  renderCore();
}

export function update(opts){
  if (opts && 'state' in opts) state = opts.state;
  if (opts && 'selectedSeat' in opts) selectedSeat = opts.selectedSeat;
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
