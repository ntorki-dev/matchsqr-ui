
/* clarification-overlay.js
 * v6.2 – Full-screen blur, readable text, larger panel (ESM)
 *
 * Exports:
 *   initClarificationOverlay()
 *   setHostElement(el)
 *   setClarification(text)
 *   syncClarificationButton()
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

  // FULL-PAGE backdrop for blur + dim
  const backdrop = document.createElement('div');
  backdrop.id = OVERLAY_ID;
  Object.assign(backdrop.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    right: '0',
    bottom: '0',
    zIndex: '9999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    background: 'rgba(0,0,0,0.35)',
    padding: '16px',
  });

  // Centered panel using .card style, readable text enforced
  const panel = document.createElement('div');
  panel.className = 'card';
  Object.assign(panel.style, {
    maxWidth: '800px',
    width: '92%',
    maxHeight: '80%',
    overflow: 'auto',
    padding: '20px 20px 12px 20px',
    position: 'relative',
    background: 'var(--card-bg, #fff)',
    color: 'var(--card-fg, #111)',
  });

  const x = document.createElement('button');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close clarification');
  Object.assign(x.style, {
    position: 'absolute',
    top: '8px',
    right: '12px',
    border: 'none',
    background: 'transparent',
    fontSize: '22px',
    cursor: 'pointer',
    color: 'inherit',
  });
  x.textContent = '×';
  x.addEventListener('click', closeOverlay);

  const title = document.createElement('h4');
  title.textContent = 'Clarification';
  Object.assign(title.style, {
    margin: '0 28px 10px 0',
    color: 'inherit',
  });

  const body = document.createElement('div');
  // Keep small-text class if present, but force readable color
  body.classList.add('help');
  Object.assign(body.style, {
    whiteSpace: 'pre-wrap',
    marginTop: '6px',
    color: 'inherit',
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

  // Attach to body to ensure full-page coverage
  document.body.appendChild(backdrop);
}

function closeOverlay() {
  const n = document.getElementById(OVERLAY_ID);
  if (n) {
    try { n._cleanup && n._cleanup(); } catch {}
    n.remove();
  }
}
