
/* clarification-overlay.js
 * v3 – self-initializing, zero-touch integration
 * - Shows a small white "?" in a dark circle at bottom-right of the question card.
 * - Opens a small panel over the card (not full page) with blur + dim backdrop.
 * - Uses existing .card and .help classes if available, no CSS file edits.
 * - No DB calls. Reads clarification from in-memory state.
 * - Works even if you forget to call init, as long as this file is loaded.
 * - Defensive against missing selectors and different state holders.
 */

(function () {
  const BTN_ID = 'ms-clarify-btn';
  const OVERLAY_ID = 'ms-clarify-overlay';
  const OBS_TOKEN_ATTR = 'data-ms-clar-init';
  let mountedCard = null;
  let cardObserver = null;
  let rootObserver = null;
  let lastClarText = null;

  // --- Debug aid (minimal, silent unless DEBUG flag true) ---
  const DEBUG = false;
  function dbg(...args) { if (DEBUG) console.debug('[Clarify]', ...args); }

  // --- State lookups ---
  function getStateCandidates() {
    const arr = [];
    if (globalThis.Game && typeof Game === 'object') arr.push(Game.state, Game);
    if (globalThis.App && typeof App === 'object') arr.push(App.state, App);
    if (globalThis.state && typeof state === 'object') arr.push(state);
    return arr.filter(Boolean);
  }

  function pickQuestionFrom(obj) {
    if (!obj) return null;
    // Common forms: obj.question, obj.state.question
    if (obj.question && typeof obj.question === 'object') return obj.question;
    if (obj.state && obj.state.question) return obj.state.question;
    return null;
  }

  function getCurrentQuestion() {
    // Try known places
    for (const c of getStateCandidates()) {
      const q = pickQuestionFrom(c);
      if (q && (q.text !== undefined || q.title !== undefined)) return q;
    }
    // Fallback, scan a couple globals shallowly
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
    const q = getCurrentQuestion();
    if (!q) return '';
    // Typical field name is 'clarification'
    const txt = q.clarification ?? q.help ?? q.note ?? '';
    return typeof txt === 'string' ? txt.trim() : '';
  }

  // --- DOM targeting ---
  function locateQuestionCard() {
    // Priority: explicit ids and known structure
    const picks = [
      document.getElementById('msQ'),
      document.querySelector('#msQ .question-block'),
      document.querySelector('#mainCard .question-block'),
      document.querySelector('.question-block'),
      document.querySelector('#mainCard .card'),
      document.querySelector('.card .question-block'),
    ].filter(Boolean);

    if (picks.length === 0) return null;
    // Prefer the nearest .card to keep overlay bounds tight
    for (const el of picks) {
      const card = el.closest('.card');
      if (card) return card;
    }
    // otherwise return the first match
    return picks[0];
  }

  function ensureRelPosition(el) {
    if (!el) return;
    const cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';
  }

  // --- Button ---
  function ensureButton(card) {
    let btn = document.getElementById(BTN_ID);
    if (!card) {
      if (btn) btn.remove();
      return null;
    }

    // If clarification is empty, do not show the button
    const clar = getClarification();
    if (!clar) {
      if (btn) btn.remove();
      lastClarText = null;
      return null;
    }

    ensureRelPosition(card);

    if (!btn) {
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
    }

    if (btn.parentElement !== card) {
      btn.remove();
      card.appendChild(btn);
    }

    mountedCard = card;
    return btn;
  }

  // --- Overlay ---
  function openOverlay() {
    closeOverlay();

    const card = mountedCard || locateQuestionCard();
    if (!card) return;

    const clar = getClarification();
    if (!clar) return;

    // Backdrop within the card bounds only
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

    // Panel using .card
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
    body.classList.add('help'); // harmless if not defined
    Object.assign(body.style, {
      whiteSpace: 'pre-wrap',
      marginTop: '4px',
    });
    body.textContent = clar;

    panel.appendChild(x);
    panel.appendChild(title);
    panel.appendChild(body);
    backdrop.appendChild(panel);

    // Close on backdrop click
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeOverlay();
    });

    // Close on Esc
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

  // --- Observers ---
  function watchCard(card) {
    if (cardObserver) {
      cardObserver.disconnect();
      cardObserver = null;
    }
    if (!card) return;

    cardObserver = new MutationObserver(() => {
      // Re-evaluate the presence of clarification on any change within the card
      const clar = getClarification();
      if (clar !== lastClarText) {
        lastClarText = clar;
        ensureButton(card);
      } else {
        // If clarification did not change, still ensure the button is mounted correctly
        ensureButton(card);
      }
    });

    cardObserver.observe(card, { childList: true, subtree: true, characterData: true });
  }

  function startRootObserver() {
    if (rootObserver) {
      rootObserver.disconnect();
      rootObserver = null;
    }
    rootObserver = new MutationObserver(() => {
      const card = locateQuestionCard();
      if (card && card !== mountedCard) {
        mountedCard = card;
        ensureRelPosition(card);
        ensureButton(card);
        watchCard(card);
      } else if (!card) {
        mountedCard = null;
        ensureButton(null);
      }
    });

    rootObserver.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    if (document.body.getAttribute(OBS_TOKEN_ATTR) === '1') {
      // already initialized
      return;
    }
    document.body.setAttribute(OBS_TOKEN_ATTR, '1');

    const card = locateQuestionCard();
    if (card) {
      ensureRelPosition(card);
      ensureButton(card);
      watchCard(card);
    } else {
      ensureButton(null);
    }

    // Start a root observer to react when the card mounts/unmounts
    startRootObserver();

    // A few delayed checks to catch async state hydration
    setTimeout(() => ensureButton(locateQuestionCard()), 250);
    setTimeout(() => ensureButton(locateQuestionCard()), 750);
    setTimeout(() => ensureButton(locateQuestionCard()), 1500);
  }

  // Expose minimal API in case you want manual control
  globalThis.MSClarification = {
    open: openOverlay,
    close: closeOverlay,
    sync: () => ensureButton(locateQuestionCard())
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // Support ESM side-effect import
  try {
    // If modules are supported, export a no-op init for explicit control if desired
    // eslint-disable-next-line no-undef
    if (typeof export !== 'undefined') {
      // do nothing
    }
  } catch {}
})();
