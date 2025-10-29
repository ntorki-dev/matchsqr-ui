
/* clarification-overlay.js
 * v6 – From-scratch, minimal, reliable (ESM)
 *
 * What it does
 * - Renders a small white "?" button at bottom-right inside a host element you provide.
 * - Opens a compact overlay over that host element only, with dim + blur backdrop.
 * - Uses existing .card and .help classes if present. No CSS edits. No DB calls.
 *
 * How to use from game.js
 *   import { initClarificationOverlay, setClarification, syncClarificationButton, setHostElement } from './clarification-overlay.js';
 *   // once, after the question DOM exists
 *   initClarificationOverlay();
 *   setHostElement(document.querySelector('#msQ')?.closest('.card') || document.querySelector('#msQ'));
 *   setClarification(state.question?.clarification || '');
 *   syncClarificationButton();
 *
 * You can call setClarification(...) on every question change.
 */

let hostEl = null;
let btnEl = null;
let lastClar = '';
const BTN_ID = 'ms-clarify-btn';
const OVERLAY_ID = 'ms-clarify-overlay';

export function setHostElement(el) {
  hostEl = el || null;
  ensureButton();
}

export function setClarification(text) {
  lastClar = typeof text === 'string' ? text.trim() : '';
  ensureButton();
}

export function initClarificationOverlay() {
  // no-op placeholder in case you want future init hooks
  // Keep to match the import you already wrote.
  ensureButton();
}

export function syncClarificationButton() {
  ensureButton();
}

function ensureRelPosition(el) {
  if (!el) return;
  const cs = getComputedStyle(el);
  if (cs.position === 'static') el.style.position = 'relative';
}

function ensureButton() {
  // remove if cannot render
  if (!hostEl || !lastClar) {
    const old = document.getElementById(BTN_ID);
    if (old) old.remove();
    return;
  }

  ensureRelPosition(hostEl);

  if (!btnEl || !btnEl.isConnected) {
    btnEl = document.createElement('button');
    btnEl.id = BTN_ID;
    btnEl.type = 'button';
    btnEl.setAttribute('aria-label', 'Show clarification');
    Object.assign(btnEl.style, {
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
    btnEl.textContent = '?';
    btnEl.addEventListener('click', openOverlay);
  }

  if (btnEl.parentElement !== hostEl) {
    btnEl.remove();
    hostEl.appendChild(btnEl);
  }
}

function openOverlay() {
  closeOverlay();
  if (!hostEl || !lastClar) return;

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
  body.textContent = lastClar;

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

  hostEl.appendChild(backdrop);
}

function closeOverlay() {
  const n = document.getElementById(OVERLAY_ID);
  if (n) {
    try { n._cleanup && n._cleanup(); } catch {}
    n.remove();
  }
}
