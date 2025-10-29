
/* clarification-overlay.js
 * v6.3 – Transparent "?" button, compact panel, full-screen blur (ESM)
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
  // Remove if cannot render
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
    // Strict transparent circle with white border and white glyph
    btnEl.style.position = 'absolute';
    btnEl.style.right = '10px';
    btnEl.style.bottom = '10px';
    btnEl.style.width = '28px';
    btnEl.style.height = '28px';
    btnEl.style.borderRadius = '50%';
    btnEl.style.border = '2px solid rgba(255,255,255,0.95)';
    btnEl.style.background = 'transparent';              // <— transparent background
    btnEl.style.color = '#ffffff';                       // white glyph
    btnEl.style.fontWeight = '700';
    btnEl.style.lineHeight = '26px';
    btnEl.style.textAlign = 'center';
    btnEl.style.cursor = 'pointer';
    btnEl.style.zIndex = '5';
    btnEl.style.boxShadow = 'none';                      // no dark halo
    btnEl.style.padding = '0';
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

  // Full-page blurred, dimmed backdrop
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

  // Compact panel
  const panel = document.createElement('div');
  panel.className = 'card';
  Object.assign(panel.style, {
    maxWidth: '420px',
    width: '80%',
    maxHeight: '45%',
    overflow: 'auto',
    padding: '20px 20px 12px 20px',
    position: 'relative',
    background: '#fff',   // readable light bg
    color: '#111',        // dark text
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

  document.body.appendChild(backdrop);
}

function closeOverlay() {
  const n = document.getElementById(OVERLAY_ID);
  if (n) {
    try { n._cleanup && n._cleanup(); } catch {}
    n.remove();
  }
}
