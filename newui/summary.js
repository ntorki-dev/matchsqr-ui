// summary.js
// Renders the Summary parade and per-viewer action panel.
// Reuses existing CSS classes from app.css. No new styles.

import { jpost, getSession, resolveGameId, msPidKey, getRole } from './api.js';
import { $, toast } from './ui.js';

let state = null;
let container = null;
let selectedSeat = null;
let code = null;
let myPid = null;
let isHost = false;

// Temporary static summaries for MVP
const STATIC_SUMMARIES = [
  { title: "The Empath", text: "You connected deeply with others and listened with care." },
  { title: "The Thinker", text: "You reflected on each question and gave thoughtful answers." },
  { title: "The Adventurer", text: "You brought energy, humor, and curiosity to the group." },
  { title: "The Realist", text: "You kept things grounded and practical throughout the game." },
  { title: "The Optimist", text: "You looked for bright angles and encouraged others." },
  { title: "The Analyst", text: "You compared tradeoffs and explained your reasoning clearly." },
  { title: "The Storyteller", text: "You used vivid examples and personal stories." },
  { title: "The Challenger", text: "You asked sharp questions that opened new ideas." },
];

function pickStaticSummary(idx) {
  // Deterministic pick by seat index
  const list = STATIC_SUMMARIES;
  if (!Array.isArray(list) || list.length===0) return { title:"Summary", text:"Thanks for playing." };
  const i = Math.abs(Number(idx||0)) % list.length;
  return list[i];
}

function seatsSorted(participants){
  const ps = Array.isArray(participants) ? participants.slice() : [];
  return ps
    .filter(p => typeof p?.seat_index === 'number')
    .sort((a,b)=>a.seat_index-b.seat_index);
}

function displayName(p, sessionUser){
  const uid = p?.user_id || p?.auth_user_id || p?.owner_id || p?.userId || p?.uid || '';
  let name = p?.profile_name || p?.nickname || p?.name || 'Guest';
  const emailName = (sessionUser?.email||'').split('@')[0] || null;
  const isMe = !!(sessionUser && (
    (uid && String(uid)===String(sessionUser.id||'')) ||
    (emailName && typeof p?.name==='string' && p.name===emailName)
  ));
  if (isMe && sessionUser?.user_metadata?.name){ name = sessionUser.user_metadata.name; }
  return name;
}

function renderCore(){
  if (!container || !state) return;
  const sessionUser = window.__MS_SESSION || null; // set by api.getSession elsewhere
  const isLoggedIn = !!(sessionUser && sessionUser.id);
  const participants = seatsSorted(state.participants||[]);
  if (!participants.length){
    container.innerHTML = '<h3>Summary</h3><p class="help">No participants found.</p>';
    return;
  }

  // Determine selected seat
  const seats = participants.map(p=>p.seat_index);
  if (selectedSeat==null) selectedSeat = seats[0];
  const idx = seats.indexOf(selectedSeat);
  const current = participants[Math.max(0, idx)] || participants[0];
  const currentSeat = current?.seat_index;
  const currentPid = current?.participant_id || current?.id || null;

  // Determine viewer participant to enforce visibility rules
  let viewerP = null;
  for (const p of participants){
    const pid = p?.participant_id || p?.id || null;
    if (pid && myPid && String(pid)===String(myPid)){ viewerP = p; break; }
  }
  const viewerSeat = viewerP?.seat_index;

  // Build UI
  const staticSum = pickStaticSummary(currentSeat);
  const name = displayName(current, sessionUser);

  // Host-only navigation controls
  const navHtml = isHost ? (
    '<div class="inline-actions" style="justify-content:center;gap:8px;">'+
      '<button id="msPrev" class="btn secondary">Previous</button>'+
      '<button id="msNext" class="btn">Next</button>'+
    '</div>'
  ) : '';

  // Per-viewer action panel, only when viewer is the displayed participant
  let viewerPanel = '';
  if (viewerSeat!=null && currentSeat!=null && Number(viewerSeat)===Number(currentSeat)){
    if (isLoggedIn){
      viewerPanel =
        '<div class="inline-actions" style="justify-content:center;margin-top:8px;">'+
          '<button id="msFullReport" class="btn">Get my full report</button>'+
        '</div>';
    }else{
      viewerPanel =
        '<p class="help" style="margin-top:8px;">Please register below in the next 30 minutes to get a full report.</p>'+
        '<div class="inline-actions" style="justify-content:center;">'+
          '<button id="msRegister" class="btn">Register</button>'+
        '</div>';
    }
  }

  container.innerHTML =
    ''+
      '<h3>Summary</h3>'+
      '<p class="help" style="margin-top:-8px;">Game ended. Host controls which player is shown.</p>'+
      '<h4 style="margin-top:12px;">'+ name +'</h4>'+
      '<p>'+ staticSum.text +'</p>'+
      navHtml +
      viewerPanel +
      '<div class="inline-actions" style="justify-content:center;margin-top:12px;">'+
        '<a class="btn" href="#/host">Host a new game</a>'+
        '<button id="msShare" class="btn secondary">Share</button>'+
      '</div>'+
    '</div>';

  // Wire buttons
  const prevBtn = $('#msPrev');
  const nextBtn = $('#msNext');
  if (prevBtn) prevBtn.onclick = ()=>{
    try{
      const arr = seats;
      const i = Math.max(0, arr.indexOf(selectedSeat));
      const next = arr[(i-1+arr.length)%arr.length];
      selectedSeat = next;
      renderCore();
    }catch(e){ toast(e.message||'Failed'); }
  };
  if (nextBtn) nextBtn.onclick = ()=>{
    try{
      const arr = seats;
      const i = Math.max(0, arr.indexOf(selectedSeat));
      const next = arr[(i+1)%arr.length];
      selectedSeat = next;
      renderCore();
    }catch(e){ toast(e.message||'Failed'); }
  };

  const shareBtn = $('#msShare');
  if (shareBtn){
    shareBtn.onclick = ()=>{
      try{
        navigator.clipboard.writeText(location.origin+location.pathname+'#/');
        toast('Link copied');
      }catch(_){}
    };
  }

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

  const fullBtn = $('#msFullReport');
  if (fullBtn){
    fullBtn.onclick = async()=>{
      try{
        // Try to call email_full_report. If backend rejects, show toast only.
        const gid = resolveGameId(state.id);
        await jpost('email_full_report', { game_id: gid, participant_id: myPid });
        toast('Report will be emailed to you');
      }catch(e){
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
  // Cache session for name resolution
  getSession().then(s=>{ window.__MS_SESSION = s?.user || null; renderCore(); }).catch(()=>renderCore());
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
  state = null; container = null; selectedSeat = null; code = null; myPid = null; isHost = false;
}
