// summary.js
// Renders the Summary parade and per-viewer action panel.
// Reuses existing CSS classes from app.css only.

import { jpost, getSession, resolveGameId, msPidKey } from './api.js';
import { $, toast } from './ui.js';

let state = null;
let container = null;
let selectedSeat = null;
let code = null;
let myPid = null;
let isHost = false;

// Realtime channel handle
let rtChannel = null;

// Persist selection, so polling does not reset it
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
  if (!Array.isArray(list) || list.length === 0) return { title: 'Summary', text: 'Thanks for playing.' };
  const i = Math.abs(Number(idx || 0)) % list.length;
  return list[i];
}

function seatsSorted(participants){
  const ps = Array.isArray(participants) ? participants.slice() : [];
  return ps.filter(p => typeof p?.seat_index === 'number').sort((a,b)=>a.seat_index - b.seat_index);
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

// Resolve this viewer's participant at click time, with multiple fallbacks
function resolveMyParticipant(participants, sessionUser){
  if (myPid){
    const byPid = participants.find(p=>{
      const pid = p?.participant_id || p?.id || null;
      const tmp = p?.tempId || null;
      return (pid && String(pid)===String(myPid)) || (tmp && String(tmp)===String(myPid));
    });
    if (byPid) return byPid;
  }
  if (sessionUser?.id){
    const byUser = participants.find(p=>String(p?.user_id||'')===String(sessionUser.id));
    if (byUser) return byUser;
  }
  return participants[0] || null;
}

// ---------- Realtime sync (host -> all) ----------
function setupRealtime(gameCode){
  try{
    // if Supabase not present, skip
    const sb = window?.supabase;
    if (!sb || !gameCode) return;

    // create or reuse channel
    if (rtChannel) try{ rtChannel.unsubscribe(); }catch(_){}
    rtChannel = sb.channel('ms_summary_'+String(gameCode));

    // guests listen to selection broadcasts
    rtChannel.on('broadcast', { event: 'summary_select' }, payload=>{
      try{
        if (isHost) return; // host already local
        const seat = Number(payload?.payload?.seat);
        if (!Number.isFinite(seat)) return;
        selectedSeat = seat;
        saveSelected(code, seat);
        renderCore();
      }catch(_){}
    });

    rtChannel.subscribe();
  }catch(_){}
}

function broadcastSelection(seat){
  try{
    const sb = window?.supabase;
    if (!sb || !rtChannel) return;
    rtChannel.send({ type:'broadcast', event:'summary_select', payload:{ seat: Number(seat) } });
  }catch(_){}
}
// ---------- end realtime ----------

function renderCore(){
  if (!container || !state) return;
  const sessionUser = window.__MS_SESSION || null;
  const isLoggedIn = !!(sessionUser && sessionUser.id);
  const participants = seatsSorted(state.participants || []);

  if (!participants.length){
    container.innerHTML =
      '<div class="inline-actions"><h3>Game Summary</h3></div>'+
      '<p class="help">No participants found.</p>';
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

  const staticSum = pickStaticSummary(currentSeat);
  const name = displayName(current, sessionUser);

  // Host-only navigation
  const navHtml = isHost ? (
    '<div class="inline-actions">'
      + '<a id="msPrev" class="help" href="#"><img src="./assets/previous.png" alt="Previous" width="16" height="16"/> Previous Player</a>'
      + '<a id="msNext" class="help" href="#">Next Player <img src="./assets/forward.png" alt="Next" width="16" height="16"/></a>'
    + '</div>'
  ) : '';

  // Fixed action panel, always visible
  const actionPanel =
    '<div class="inline-actions" id="msActionPanel" style="margin-top:8px;">'
      + (isLoggedIn
          ? '<button id="msFullReport" class="btn">Get my full report</button>'
          : '<div><p class="help" style="margin-bottom:6px;">Please register below in the next 30 minutes to get a full report.</p><div class="inline-actions"><button id="msRegister" class="btn">Register</button></div></div>'
        )
    + '</div>';

  // Compose
  container.innerHTML =
    '<div class="inline-actions"><h3>Game Summary</h3></div>'
    + '<p><strong>'+ name +'</strong></p>'
    + '<p class="help">'+ staticSum.text +'</p>'
    + navHtml
    + actionPanel;

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
        if (isHost) broadcastSelection(next);
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
        if (isHost) broadcastSelection(next);
      }catch(e){ toast(e.message || 'Failed'); }
    };
  }

  // Register click, resolved to this viewer's participant at click time
  const regBtn = $('#msRegister');
  if (regBtn){
    regBtn.onclick = ()=>{
      try{
        const mine = resolveMyParticipant(participants, sessionUser);
        const pid = mine?.participant_id || mine?.id || myPid || null;
        localStorage.setItem('ms_attach_payload', JSON.stringify({
          game_id: state.id,
          temp_player_id: pid
        }));
      }catch(_){}
      try{ location.hash = '#/register'; }catch(_){}
    };
  }

  // Full report click, resolved to this viewer's participant at click time
  const fullBtn = $('#msFullReport');
  if (fullBtn){
    fullBtn.onclick = async()=>{
      try{
        const mine = resolveMyParticipant(participants, sessionUser);
        const pid = mine?.participant_id || mine?.id || myPid || null;
        const gid = resolveGameId(state.id);
        await jpost('email_full_report', { game_id: gid, participant_id: pid });
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

  // Try to recover myPid for guests on this device
  if (!myPid && code){
    try{
      myPid = JSON.parse(sessionStorage.getItem(msPidKey(code)) || 'null');
      if (!myPid) myPid = JSON.parse(localStorage.getItem(msPidKey(code)) || 'null');
    }catch(_){ myPid = null; }
  }

  isHost = !!opts?.isHost;

  // Setup realtime sync if available
  setupRealtime(code);

  // Cache session for display names, then render
  getSession().then(s=>{
    window.__MS_SESSION = s?.user || null;
    renderCore();
  }).catch(()=>renderCore());
}

export function update(opts){
  if (opts && 'state' in opts) state = opts.state;
  if (opts && 'selectedSeat' in opts) selectedSeat = opts.selectedSeat;
  if (opts && 'isHost' in opts) isHost = !!opts.isHost;
  renderCore();
}

export function unmount(){
  if (container) container.innerHTML = '';
  try{ if (rtChannel) rtChannel.unsubscribe(); }catch(_){}
  rtChannel = null;
  state = null;
  container = null;
  selectedSeat = null;
  code = null;
  myPid = null;
  isHost = false;
}
