
/* clarification-overlay.js
 * v5 – ESM with named exports + safe auto-init
 * - Renders a white "?" button bottom-right inside the current question card.
 * - Opens a small panel over the card, with blur + dim backdrop.
 * - Uses existing .card and .help classes if present. No CSS edits. No DB calls.
 * - Reads clarification from, in order:
 *     1) data-clarification attribute on the question host element (if present)
 *     2) Game.state.question.clarification (or App/state fallbacks)
 * - Exposes:
 *     initClarificationOverlay({ getQuestionHostEl, getCurrentQuestion })
 *     syncClarificationButton()
 */

let getHost = null;
let getQuestion = null;

let mountedCard = null;
let btn = null;
let rootObserver = null;
let cardObserver = null;
let lastClarText = null;

const BTN_ID = 'ms-clarify-btn';
const OVERLAY_ID = 'ms-clarify-overlay';

function defaultGetHost() {
  // Prefer explicit ids/classes known in this project
  const picks = [
    document.getElementById('msQ'),
    document.querySelector('#msQ .question-block'),
    document.querySelector('#mainCard .question-block'),
    document.querySelector('.question-block'),
    document.querySelector('#mainCard .card'),
    document.querySelector('.card .question-block'),
  ].filter(Boolean);

  if (picks.length === 0) return null;
  for (const el of picks) {
    const card = el.closest?.('.card');
    if (card) return card;
  }
  return picks[0];
}

function pickQuestionFrom(obj) {
  if (!obj) return null;
  if (obj.question && typeof obj.question === 'object') return obj.question;
  if (obj.state && obj.state.question) return obj.state.question;
  return null;
}

function defaultGetQuestion() {
  const candidates = [];
  if (globalThis.Game && typeof Game === 'object') candidates.push(Game.state, Game);
  if (globalThis.App && typeof App === 'object') candidates.push(App.state, App);
  if (globalThis.state && typeof state === 'object') candidates.push(state);
  for (const c of candidates) {
    const q = pickQuestionFrom(c);
    if (q && (q.text !== undefined || q.title !== undefined)) return q;
  }
  // last-resort shallow scan
  for (const k of Object.keys(globalThis)) {
    try {
      const v = globalThis[k];
      const q = pickQuestionFrom(v);
      if (q && (q.text !== undefined || q.title !== undefined)) return q;
    } catch {}
  }
  return null;
}

function getClarification() {
  const host = (getHost || defaultGetHost)();
  if (host) {
    const attr = host.getAttribute?.('data-clarification');
    if (attr && attr.trim()) return attr.trim();
  }
  const q = (getQuestion || defaultGetQuestion)();
  if (!q) return '';
  const txt = q.clarification ?? q.help ?? q.note ?? '';
  return typeof txt === 'string' ? txt.trim() : '';
}

function ensureRelPosition(el) {
  if (!el) return;
  const cs = getComputedStyle(el);
  if (cs.position === 'static') el.style.position = 'relative';
}

function createButton() {
  if (btn && btn.isConnected) return btn;

  btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Show clarification');
  Object.assign(btn.style, {
    position: 'absolute',
    right: '10px',
    bottom: '10px',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(20,20,20,0.85)',
    color: '#fff',
    fontWeight: '700',
    lineHeight: '28px',
    textAlign: 'center',
    cursor: 'pointer',
    zIndex: '5',
    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
    padding: '0',
  });
  btn.textContent = '?';
  btn.addEventListener('click', openOverlay);
  return btn;
}

function openOverlay() {
  closeOverlay();
  const card = mountedCard || (getHost || defaultGetHost)();
  if (!card) return;

  const clar = getClarification();
  if (!clar) return;

  const backdrop = document.createElement('div');
  backdrop.id = OVERLAY_ID;
  Object.assign(backdrop.style, {
    position: 'absolute',
    inset: '0',
    zIndex: '10',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(6px)',
    background: 'rgba(0,0,0,0.25)',
  });

  const panel = document.createElement('div');
  panel.className = 'card';
  Object.assign(panel.style, {
    maxWidth: '680px',
    width: '90%',
    maxHeight: '70%',
    overflow: 'auto',
    padding: '16px 16px 8px 16px',
    position: 'relative',
  });

  const x = document.createElement('button');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close clarification');
  Object.assign(x.style, {
    position: 'absolute',
    top: '8px',
    right: '10px',
    border: 'none',
    background: 'transparent',
    fontSize: '20px',
    cursor: 'pointer',
  });
  x.textContent = '×';
  x.addEventListener('click', closeOverlay);

  const title = document.createElement('h4');
  title.textContent = 'Clarification';
  title.style.margin = '0 24px 8px 0';

  const body = document.createElement('div');
  body.classList.add('help');
  Object.assign(body.style, {
    whiteSpace: 'pre-wrap',
    marginTop: '4px',
  });
  body.textContent = clar;

  panel.appendChild(x);
  panel.appendChild(title);
  panel.appendChild(body);
  backdrop.appendChild(panel);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeOverlay();
  });

  const onKey = (e) => { if (e.key === 'Escape') closeOverlay(); };
  document.addEventListener('keydown', onKey, { once: true });
  backdrop._cleanup = () => document.removeEventListener('keydown', onKey);

  card.appendChild(backdrop);
}

function closeOverlay() {
  const n = document.getElementById(OVERLAY_ID);
  if (n) {
    try { n._cleanup && n._cleanup(); } catch {}
    n.remove();
  }
}

function ensureButtonMounted() {
  const card = (getHost || defaultGetHost)();
  const clar = getClarification();

  // remove if not applicable
  if (!card || !clar) {
    const old = document.getElementById(BTN_ID);
    if (old) old.remove();
    mountedCard = null;
    return;
  }

  ensureRelPosition(card);
  const b = createButton();
  if (b.parentElement !== card) {
    b.remove();
    card.appendChild(b);
  }
  mountedCard = card;
}

function watchCard() {
  const card = (getHost || defaultGetHost)();
  if (!card) return;
  if (cardObserver) cardObserver.disconnect();

  cardObserver = new MutationObserver(() => {
    const clar = getClarification();
    if (clar !== lastClarText) {
      lastClarText = clar;
      ensureButtonMounted();
    } else {
      ensureButtonMounted();
    }
  });
  cardObserver.observe(card, { childList: true, subtree: true, characterData: true });
}

function startRootObserver() {
  if (rootObserver) rootObserver.disconnect();
  rootObserver = new MutationObserver(() => {
    ensureButtonMounted();
    watchCard();
  });
  rootObserver.observe(document.body, { childList: true, subtree: true });
}

export function initClarificationOverlay({ getQuestionHostEl, getCurrentQuestion }) {
  // Configure getters, or fall back to defaults
  getHost = typeof getQuestionHostEl === 'function' ? getQuestionHostEl : null;
  getQuestion = typeof getCurrentQuestion === 'function' ? getCurrentQuestion : null;

  ensureButtonMounted();
  watchCard();
  startRootObserver();

  setTimeout(ensureButtonMounted, 200);
  setTimeout(ensureButtonMounted, 600);
  setTimeout(ensureButtonMounted, 1200);
}

export function syncClarificationButton() {
  ensureButtonMounted();
}

/* Safe auto-init:
 * If the app forgets to call init, we still try to mount after DOM ready.
 * If init() is later called, supplied getters override defaults cleanly.
 */
if (typeof window !== 'undefined') {
  const autoKick = () => {
    ensureButtonMounted();
    startRootObserver();
    setTimeout(ensureButtonMounted, 250);
    setTimeout(ensureButtonMounted, 750);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoKick, { once: true });
  } else {
    autoKick();
  }
}
