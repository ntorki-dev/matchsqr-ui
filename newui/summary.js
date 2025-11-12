// web/newui/summary.js
// Summary UI (post-game).
// - Card content -> #mainCard
// - Single action button -> #toolsRow (mic/keyboard row)
// - Host-only navigation: uses opts.isHost. Backend is permissive (JWT OFF).

import { jpost, getSession, msPidKey, resolveGameId } from './api.js';
import { $, toast } from './ui.js';

let state = null;
let container = null;   // #mainCard
let code = null;
let isHostFlag = false;
let myPid = null;
let selectedSeat = null;

// ----- helpers -----
function seats() {
  return Array.isArray(state?.participants) ? state.participants.map(p => p.seat_index) : [];
}
function bySeat(seat) {
  const list = Array.isArray(state?.participants) ? state.participants : [];
  return list.find(p => Number(p.seat_index) === Number(seat)) || null;
}
function displayName(p, sessionUser) {
  let name = p?.profile_name || p?.nickname || p?.name || 'Guest';
  if (sessionUser?.id && p?.user_id && String(p.user_id) === String(sessionUser.id)) {
    if (sessionUser?.user_metadata?.name) name = sessionUser.user_metadata.name;
  }
  return name;
}
function meFrom(sessionUser) {
  try {
    const pid = myPid || JSON.parse(sessionStorage.getItem(msPidKey(code)) || 'null') ||
                 JSON.parse(localStorage.getItem(msPidKey(code)) || 'null');
    if (pid) {
      const hit = (state?.participants || []).find(p => String(p.id || p.participant_id) === String(pid));
      if (hit) return hit;
    }
  } catch(_){}
  if (sessionUser?.id) {
    const hit = (state?.participants || []).find(p => String(p.user_id || '') === String(sessionUser.id));
    if (hit) return hit;
  }
  return (state?.participants && state.participants[0]) || null;
}
function shortSummaryForSeat(seatIndex) {
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
  const i = Math.abs(Number(seatIndex || 0)) % t.length;
  return t[i];
}
function gameId() {
  const cand = state?.id || state?.game_id || state?.game?.id || code || null;
  try { return resolveGameId(cand); } catch(_) { return null; }
}

// ----- edge calls (selected seat only) -----
async function getSelectedSeat() {
  const gid = gameId();
  if (!gid) return null;
  const out = await jpost('summary', { action: 'get_selected', game_id: gid });
  return (out && typeof out.selected_seat === 'number') ? out.selected_seat : null;
}
async function setSelectedSeat(seat) {
  const gid = gameId();
  if (!gid) throw new Error('Missing game id');
  await jpost('summary', { action: 'set_selected', game_id: gid, seat_index: seat });
}

// ----- render -----
function renderCard() {
  const seatList = seats();

  // Ensure the nav sits at the bottom
  container.style.display = 'flex';
  container.style.flexDirection = 'column';

  if (!seatList.length) {
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
      '<p><strong>' + displayName(current, sessionUser) + '</strong></p>' +
      '<p class="help" style="margin-top:6px;margin-bottom:0">' + shortSummaryForSeat(current?.seat_index) + '</p>' +
      (haveSession ? '' : '<p class="help" style="margin:10px 0 0 0"><br> </br>You can register below in the next 30 minutes to get a full report, otherwise your answers will be deleted.</p>') +
    '</div>';

  const showNav = !!isHostFlag; // host only; backend is permissive in MVP
  const nav = showNav
    ? ('<div style="display:inline-flex;justify-content:space-between;align-items:center;margin-top:auto;line-height:1;gap:6px;">' +
         '<a id="msPrev" class="help" href="#" style="display:inline-flex;align-items:center;line-height:1;gap:6px;"><img src="./assets/previous.png" width="16" height="16" alt="Previous"/> Previous</a>' +
         '<a id="msNext" class="help" href="#" style="display:inline-flex;align-items:center;line-height:1;gap:6px;">Next <img src="./assets/forward.png" width="16" height="16" alt="Next"/></a>' +
       '</div>')
    : '';

  container.innerHTML = title + body + nav;

  if (showNav) {
    $('#msPrev')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const i = Math.max(0, seatList.indexOf(seat));
      const ns = seatList[(i - 1 + seatList.length) % seatList.length];
      try {
        await setSelectedSeat(ns);
        selectedSeat = ns;
        renderCard();
      } catch (err) {
        toast('Failed to switch player');
      }
    });

    $('#msNext')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const i = Math.max(0, seatList.indexOf(seat));
      const ns = seatList[(i + 1) % seatList.length];
      try {
        await setSelectedSeat(ns);
        selectedSeat = ns;
        renderCard();
      } catch (err) {
        toast('Failed to switch player');
      }
    });
  }
}

function renderAction() {
  const tools = document.getElementById('toolsRow'); // mic/keyboard row
  if (!tools) return;

  const sessionUser = window.__MS_SESSION || null;
  const haveSession = !!(sessionUser && sessionUser.id);

  if (haveSession) {
    // NOTE: #toolsRow is already centered by app.css; no geometry needed.
    tools.innerHTML =
      '<div class="inline-actions">' +
        '<button id="msFullReport" class="btn">Get my full report</button>' +
      '</div>';

    $('#msFullReport')?.addEventListener('click', async () => {
      const mine = meFrom(sessionUser);
      const pid = mine?.id || mine?.participant_id || myPid || null;
      if (!pid) { toast('No participant found'); return; }
      try {
        await jpost('email_full_report', { game_id: gameId(), participant_id: pid });
        toast('Report will be emailed to you');
      } catch(_) {
        toast('Report request received');
      }
    });
  } else {
    tools.innerHTML =
      '<div class="inline-actions">' +
        '<button id="msRegister" class="btn">Register</button>' +
      '</div>';

    $('#msRegister')?.addEventListener('click', () => {
      try {
        const mine = meFrom(null);
        const pid = mine?.id || mine?.participant_id || myPid || null;
        localStorage.setItem('ms_attach_payload', JSON.stringify({
          game_id: gameId(),
          temp_player_id: pid
        }));
      } catch(_){}
      location.hash = '#/register';
    });
  }
}

// ----- public API -----
export async function mount(opts) {
  state = opts?.state || null;
  container = opts?.container || null;  // #mainCard
  code = opts?.code || null;
  isHostFlag = !!opts?.isHost;
  selectedSeat = (typeof opts?.selectedSeat === 'number') ? opts.selectedSeat : null;

  myPid = opts?.myPid || null;
  if (!myPid && code) {
    try {
      myPid = JSON.parse(sessionStorage.getItem(msPidKey(code)) || 'null') ||
              JSON.parse(localStorage.getItem(msPidKey(code)) || 'null');
    } catch(_){}
  }

  try {
    const s = await getSession();
    window.__MS_SESSION = s?.user || null;
  } catch(_) { window.__MS_SESSION = null; }

  try {
    const sv = await getSelectedSeat();
    if (typeof sv === 'number') selectedSeat = sv;
  } catch(_){}

  renderCard();
  renderAction();
}

export async function update(opts) {
  if (opts && 'state' in opts) state = opts.state;
  if (opts && 'isHost' in opts) isHostFlag = !!opts.isHost;

  try {
    const sv = await getSelectedSeat();
    if (typeof sv === 'number') selectedSeat = sv;
  } catch(_){}

  renderCard();
}

export function unmount() {
  if (container) {
    container.style.display = '';
    container.style.flexDirection = '';
    container.innerHTML = '';
  }
  state = null; container = null; code = null; myPid = null; selectedSeat = null; isHostFlag = false;
}
