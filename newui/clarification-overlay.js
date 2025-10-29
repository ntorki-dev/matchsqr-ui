
// clarification-overlay.js
// Renders a small '?' button on the question card and shows a lightweight overlay
// above the card with the question's clarification text. Uses in-memory state only.

let _inited = false;
let _getCurrentQuestion = null;
let _getQuestionHostEl = null;
let _getCardEl = null;

let _btn = null;
let _overlay = null;

function ensureButton(){
  if (_btn) return _btn;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'qClarifyBtn';
  btn.setAttribute('aria-label','Show clarification');
  btn.style.position = 'absolute';
  btn.style.bottom = '8px';
  btn.style.right = '8px';
  btn.style.width = '28px';
  btn.style.height = '28px';
  btn.style.borderRadius = '999px';
  btn.style.display = 'none';
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'center';
  btn.style.border = '0';
  btn.style.cursor = 'pointer';
  btn.style.background = 'rgba(0,0,0,0.8)';
  btn.style.color = '#fff';
  btn.style.zIndex = '3';
  btn.style.padding = '0';
  btn.style.lineHeight = '0';
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="11" stroke="white" stroke-width="2" fill="none"/><text x="12" y="16" text-anchor="middle" font-size="14" font-weight="700" fill="white">?</text></svg>';
  btn.addEventListener('click', openOverlay);
  _btn = btn;
  return btn;
}

function ensureOverlay(){
  if (_overlay) return _overlay;
  const hostCard = _getCardEl ? _getCardEl() : null;
  if (!hostCard) return null;

  // hostCard must be relative for absolute overlay to cover it
  try{
    const cs = getComputedStyle(hostCard);
    if (cs.position === 'static'){ hostCard.style.position = 'relative'; }
  }catch{}

  const wrap = document.createElement('div');
  wrap.id = 'qClarifyOverlay';
  wrap.style.position = 'absolute';
  wrap.style.inset = '0';
  wrap.style.display = 'none';
  wrap.style.zIndex = '4';
  wrap.style.backdropFilter = 'blur(6px)';
  wrap.style.background = 'rgba(0,0,0,0.25)';
  wrap.addEventListener('click', (e)=>{ if (e.target === wrap) closeOverlay(); });

  const panel = document.createElement('div');
  panel.className = 'card';
  panel.style.position = 'absolute';
  panel.style.maxWidth = '90%';
  panel.style.maxHeight = '80%';
  panel.style.overflow = 'auto';
  panel.style.top = '50%';
  panel.style.left = '50%';
  panel.style.transform = 'translate(-50%,-50%)';
  panel.style.padding = '16px 16px';
  panel.style.boxSizing = 'border-box';

  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label','Close clarification');
  close.style.position = 'absolute';
  close.style.top = '8px';
  close.style.right = '8px';
  close.style.width = '28px';
  close.style.height = '28px';
  close.style.borderRadius = '999px';
  close.style.border = '0';
  close.style.cursor = 'pointer';
  close.style.background = 'rgba(0,0,0,0.8)';
  close.style.color = '#fff';
  close.innerHTML = '×';
  close.addEventListener('click', closeOverlay);

  const content = document.createElement('div');
  content.id = 'qClarifyContent';
  content.className = 'help'; // small text style present in app.css
  content.style.whiteSpace = 'pre-wrap';

  panel.appendChild(close);
  panel.appendChild(content);
  wrap.appendChild(panel);

  _overlay = wrap;
  hostCard.appendChild(wrap);

  document.addEventListener('keydown', _escHandler);
  return wrap;
}

function _escHandler(e){ if (e.key === 'Escape') closeOverlay(); }

function openOverlay(){
  const q = _getCurrentQuestion ? _getCurrentQuestion() : null;
  const text = (q && typeof q.clarification === 'string' && q.clarification.trim()) ? q.clarification.trim() : '';
  if (!text) return;
  const ov = ensureOverlay();
  if (!ov) return;

  const content = ov.querySelector('#qClarifyContent');
  if (content){ content.textContent = text; }
  ov.style.display = 'block';
}

function closeOverlay(){
  if (_overlay){ _overlay.style.display = 'none'; }
}

export function initClarificationOverlay({ getCurrentQuestion, getQuestionHostEl, getCardEl }){
  if (_inited) return;
  _getCurrentQuestion = getCurrentQuestion;
  _getQuestionHostEl = getQuestionHostEl;
  _getCardEl = getCardEl || (()=>document.getElementById('mainCard'));
  _inited = true;
}

export function syncClarificationButton(){
  if (!_inited) return;
  const host = _getQuestionHostEl ? _getQuestionHostEl() : null;
  if (!host) return;
  try{
    const cs = getComputedStyle(host);
    if (cs.position === 'static'){ host.style.position = 'relative'; }
  }catch{}
  const q = _getCurrentQuestion ? _getCurrentQuestion() : null;
  const hasClar = !!(q && typeof q.clarification === 'string' && q.clarification.trim());
  const btn = ensureButton();
  if (hasClar){
    btn.style.display = 'flex';
    if (!btn.isConnected){ host.appendChild(btn); }
  }else{
    btn.style.display = 'none';
    if (btn.isConnected && btn.parentElement !== host){ try{ host.removeChild(btn); }catch{} }
  }
}
