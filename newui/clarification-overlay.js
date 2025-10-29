
// clarification-overlay.js
// Lightweight in-card clarification overlay for Match Square
// ES module
let stateGetter = null;
let elemGetter = null;
let mountedButton = null;

function ensureRelative(el){
  const cs = getComputedStyle(el);
  if (cs.position === 'static') el.style.position = 'relative';
}

function buildButton(){
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'msClarifyBtn';
  btn.setAttribute('aria-label', 'Show clarification');
  Object.assign(btn.style, {
    position:'absolute',
    right:'10px',
    bottom:'10px',
    width:'28px',
    height:'28px',
    borderRadius:'50%',
    border:'none',
    background:'rgba(20,20,20,0.85)',
    color:'#fff',
    fontWeight:'700',
    lineHeight:'28px',
    textAlign:'center',
    cursor:'pointer',
    zIndex:'5',
    boxShadow:'0 2px 6px rgba(0,0,0,0.25)'
  });
  btn.textContent = '?';
  btn.addEventListener('click', openOverlay);
  return btn;
}

function openOverlay(){
  const host = elemGetter && elemGetter();
  if (!host) return;
  const q = stateGetter && stateGetter();
  const text = q && q.clarification ? String(q.clarification).trim() : '';
  if (!text) return;

  // Backdrop only over the card
  const backdrop = document.createElement('div');
  backdrop.id = 'msClarifyOverlay';
  Object.assign(backdrop.style, {
    position:'absolute',
    inset:'0',
    zIndex:'10',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    backdropFilter:'blur(6px)',
    background:'rgba(0,0,0,0.25)'
  });

  const panel = document.createElement('div');
  panel.className = 'card';
  Object.assign(panel.style, {
    maxWidth:'680px',
    width:'90%',
    maxHeight:'70%',
    overflow:'auto',
    padding:'16px',
    position:'relative'
  });

  const x = document.createElement('button');
  x.type = 'button';
  x.setAttribute('aria-label','Close clarification');
  Object.assign(x.style, {
    position:'absolute', top:'8px', right:'10px',
    border:'none', background:'transparent', fontSize:'20px', cursor:'pointer'
  });
  x.textContent = '×';
  x.addEventListener('click', closeOverlay);

  const title = document.createElement('h4');
  title.textContent = 'Clarification';
  title.style.margin = '0 24px 8px 0';

  const body = document.createElement('div');
  body.classList.add('help'); // existing small text style
  body.style.whiteSpace = 'pre-wrap';
  body.textContent = text;

  panel.appendChild(x);
  panel.appendChild(title);
  panel.appendChild(body);

  backdrop.addEventListener('click', (e)=>{ if (e.target === backdrop) closeOverlay(); });
  document.addEventListener('keydown', onEscOnce, { once:true });

  backdrop.appendChild(panel);
  host.appendChild(backdrop);
}

function onEscOnce(e){ if (e.key === 'Escape') closeOverlay(); }

function closeOverlay(){
  const n = document.getElementById('msClarifyOverlay');
  if (n){ n.remove(); }
}

export function initClarificationOverlay({ getCurrentQuestion, getQuestionHostEl }){
  stateGetter = getCurrentQuestion;
  elemGetter = getQuestionHostEl;
  syncClarificationButton();
}

export function syncClarificationButton(){
  const host = elemGetter && elemGetter();
  const q = stateGetter && stateGetter();
  // Clean up if missing
  if (!host || !q || !q.clarification || String(q.clarification).trim()===''){
    if (mountedButton && mountedButton.parentElement) mountedButton.parentElement.removeChild(mountedButton);
    mountedButton = null;
    return;
  }
  ensureRelative(host.closest('.card') || host);
  if (!mountedButton){
    mountedButton = buildButton();
  }else{
    if (mountedButton.parentElement && mountedButton.parentElement !== host){
      mountedButton.parentElement.removeChild(mountedButton);
    }
  }
  if (!mountedButton.parentElement){
    host.appendChild(mountedButton);
  }
}
