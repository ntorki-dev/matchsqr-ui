// summary.js
// Card content renders in #mainCard. Single action button renders in #toolsRow (mic/keyboard row).
// Participants come from state.participants passed by game.js.
// Host nav is shown whenever opts.isHost is true; backend enforces permission on click.

import { jpost, getSession, msPidKey, resolveGameId } from './api.js';
import { $, toast } from './ui.js';

let state = null;
let container = null;   // #mainCard
let code = null;
let myPid = null;
let selectedSeat = null;
let isHostFlag = false;

// ---------- helpers ----------
function seats(){ return Array.isArray(state?.participants) ? state.participants.map(p=>p.seat_index) : []; }
function bySeat(seat){
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
function meFrom(sessionUser){
  try{
    const pid = myPid || JSON.parse(sessionStorage.getItem(msPidKey(code)) || 'null') ||
                 JSON.parse(localStorage.getItem(msPidKey(code)) || 'null');
    if (pid){
      const hit = (state?.participants||[]).find(p => String(p.id||p.participant_id) === String(pid));
      if (hit) return hit;
    }
  }catch(_){}
  if (sessionUser?.id){
    const hit = (state?.participants||[]).find(p => String(p.user_id||'') === String(sessionUser.id));
    if (hit) return hit;
  }
  return (state?.participants && state.participants[0]) || null;
}
function shortSummaryForSeat(seatIndex){
  const t = [
    "You connected deeply with others and listened with care.",
    "You reflected on each question and gave thoughtful answers.",
    "You brought energy, humor, and curiosity to the group.",
    "You kept things grounded and practical throughout the game.",
    "You looked for bright angles and encouraged others.",
    "You compared tradeoffs and explained your reasoning clearly.",
    "You used vivid examples and personal stories.",
    "You asked sharp questions that opened new ideas."
  ];
  const i = Math.abs(Number(seatIndex||0)) % t.length;
  return t[i];
}
function gid(){ return resolveGameId(state?.id || null); }

// ---------- edge calls (seat only) ----------
async function getSelectedSeat(){
  const out = await jpost('summary', { action:'get_selected', game_id: gid() });
  return (out && typeof out.selected_seat === 'number') ? out.selected_seat : null;
}
async function setSelectedSeat(seat){
  await jpost('summary', { action:'set_selected', game_id: gid(), seat_index: seat });
}

// ---------- render ----------
function renderCard(){
  const seatList = seats();
  // Make the card a column so the nav can sit at the bottom
  container.style.display = 'flex';
  container.style.flexDirection = 'column';

  if (!seatList.length){
    container.innerHTML =
      '<h3 style="text-align:center;width:100%;">Game Summary</h3>' +
      '<p class="help">No participants found.</p>';
    return;
  }

  const sessionUser = window.__MS_SESSION || null;
  const haveSession = !!(sessionUser && sessionUser.id);

  const seat = (typeof selectedSeat === 'number') ? selectedSeat : seatList[0];
  const current = bySeat(seat) || bySeat(seatList[0]);

  const title = '<h3 style="text-align:center;width:100%;">Game Summary</h3>';
  const body =
    '<div>' +
      '<p><strong>'+ displayName(current, sessionUser) +'</strong></p>' +
      '<p class="help" style="margin-top:6px;margin-bottom:0">'+ shortSummaryForSeat(current?.seat_index) +'</p>' +
      (haveSession ? '' : '<p class="help" style="margin:10px 0 0 0">Please register below in the next 30 minutes to get a full report.</p>') +
    '</div>';

  // Show nav whenever game.js says viewer is host. Backend still enforces on click.
  const showNav = !!isHostFlag;
  const nav = showNav
    ? ('<div style="display:flex;justify-content:space-between;align-items:center;margin-top:auto;">' +
         '<a id="msPrev" class="help" href="#"><img src="./assets/previous.png" width="16" height="16" alt="Previous"/> Previous</a>' +
         '<a id="msNext" class="help" href="#">Next <img src="./assets/forward.png" width="16" height="16" alt="Next"/></a>' +
       '</div>')
    : '';

  container.innerHTML = title + body + nav;

  if (showNav){
    $('#msPrev')?.addEventListener('click', async (e)=>{
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
    });
    $('#msNext')?.addEventListener('click', async (e)=>{
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
    });
  }
}

// Center the button exactly under the card by matching the card width
function sizeActionWrapper(){
  const inner = document.getElementById('summaryActionInner');
  if (!inner || !container) return;
  const w = container.getBoundingClientRect().width;
  inner.style.width = w ? `${w}px` : 'auto';
  inner.style.margin = '0 auto';
}

function renderAction(){
  const tools = document.getElementById('toolsRow'); // mic/keyboard row
  if (!tools) return;

  const sessionUser = window.__MS_SESSION || null;
  const haveSession = !!(sessionUser && sessionUser.id);

  if (haveSession){
    tools.innerHTML =
      '<div id="summaryActionInner" style="display:block;width:auto;margin:0 auto;">' +
        '<div class="inline-actions"><button id="msFullReport" class="btn">Get my full report</button></div>' +
      '</div>';
    $('#msFullReport')?.addEventListener('click', async ()=>{
      const mine = meFrom(sessionUser);
      const pid = mine?.id || mine?.participant_id || myPid || null;
      if (!pid){ toast('No participant found'); return; }
      try{
        await jpost('email_full_report', { game_id: gid(), participant_id: pid });
        toast('Report will be emailed to you');
      }catch(_){ toast('Report request received'); }
    });
  }else{
    tools.innerHTML =
      '<div id="summaryActionInner" style="display:block;width:auto;margin:0 auto;">' +
        '<div class="inline-actions"><button id="msRegister" class="btn">Register</button></div>' +
      '</div>';
    $('#msRegister')?.addEventListener('click', ()=>{
      try{
        const mine = meFrom(null);
        const pid = mine?.id || mine?.participant_id || myPid || null;
        localStorage.setItem('ms_attach_payload', JSON.stringify({ game_id: gid(), temp_player_id: pid }));
      }catch(_){}
      location.hash = '#/register';
    });
  }

  // match card width and center on desktop
  sizeActionWrapper();
  // keep it responsive
  window.addEventListener('resize', sizeActionWrapper);
}

// ---------- public API ----------
export async function mount(opts){
  state = opts?.state || null;
  container = opts?.container || null;
  code = opts?.code || null;
  isHostFlag = !!opts?.isHost;
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
  renderAction();
}

export async function update(opts){
  if (opts && 'state' in opts) state = opts.state;
  if (opts && 'isHost' in opts) isHostFlag = !!opts.isHost;

  try{
    const sv = await getSelectedSeat();
    if (typeof sv === 'number') selectedSeat = sv;
  }catch(_){}

  renderCard();
  // action button stays; just resize wrapper if container width changed
  sizeActionWrapper();
}

export function unmount(){
  window.removeEventListener('resize', sizeActionWrapper);
  if (container){
    container.style.display = '';
    container.style.flexDirection = '';
    container.innerHTML = '';
  }
  state = null; container = null; code = null; myPid = null; selectedSeat = null; isHostFlag = false;
}
