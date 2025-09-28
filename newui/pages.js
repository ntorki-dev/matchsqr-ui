import { h, TopBar, Footer, Toast } from './components.js';
import { api } from './api.js';

function layout(children){
  const wrap = h('div', { class:'app-shell' }, ...children);
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.appendChild(wrap);
}

function formatTimer(msRemaining){
  if (msRemaining < 0) msRemaining = 0;
  const m = Math.floor(msRemaining/60000);
  const s = Math.floor((msRemaining%60000)/1000);
  return `${m}:${String(s).padStart(2,'0')}m`;
}

export function pageHome(){
  layout([
    TopBar({ timerText:'', canExtend:false, onExtend:()=>{}, onEnd:()=>{} }),
    h('div', { class:'container center' },
      h('div', { style:{ padding:'64px 16px' } },
        h('img', { src:'./assets/globe.svg', alt:'', style:{ width:'160px', opacity:.85 } }),
        h('h1', {}, 'Safe space to build meaningful connections.'),
        h('p', { style:{ color:'#555', maxWidth:'680px', margin:'10px auto 32px' } },
          'Play with other people interactive games designed to uncover shared values, emotional style, interests, and personality.'
        ),
        h('div', { style:{ display:'flex', gap:'12px', justifyContent:'center' } },
          h('a', { class:'btn', href:'#/host/lobby/demo' }, 'Host the Game'),
          h('a', { class:'btn', href:'#/join' }, 'Join the Game')
        )
      )
    ),
    Footer()
  ]);
}

export function pageHostLobby({ sessionId }){
  layout([
    TopBar({ timerText:'', canExtend:false, onExtend:()=>{}, onEnd:()=>{} }),
    h('div', { class:'container center' },
      h('div', { style:{ padding:'80px 16px' } },
        h('h1', {}, 'Get ready. You might be surprised!'),
        h('div', { style:{ margin:'18px 0' } },
          h('div', {}, `Game ID: ${sessionId} `),
          h('button', { class:'btn ghost', onClick:()=>{ navigator.clipboard.writeText(sessionId); Toast('Game ID copied'); } }, 'Copy')
        ),
        h('a', { class:'btn', href:`#/game/${encodeURIComponent(sessionId)}` }, 'Go to room')
      )
    ),
    Footer()
  ]);
}

function playerInitials(name){
  const first = (name || '').trim().toUpperCase().split(/\s+/)[0] || '';
  return (first.slice(0,2) || '??');
}

function placePlayers(container, players){
  const center = { x: container.clientWidth/2, y: container.clientHeight/2 };
  const radius = Math.min(center.x, center.y) - 160;
  const count = players.length;
  const angleStep = (Math.PI * 2) / count;
  players.forEach((p, i) => {
    const angle = -Math.PI/2 + i*angleStep;
    const x = center.x + radius * Math.cos(angle);
    const y = center.y + radius * Math.sin(angle);
    const el = h('div', { class:'player-bubble' + (p.isHost ? ' host' : ''), style:{ left:(x-38)+'px', top:(y-38)+'px' } },
      h('div', {}, p.initials || playerInitials(p.name)),
      p.isHost ? h('div', { class:'crown', title:'Host' }, '👑') : null,
      h('div', { class:'name' }, p.name)
    );
    container.appendChild(el);
  });
}

function SummaryCTA({ loggedIn, onRequestReport }){
  const wrap = h('div', { class:'summary-cta' },
    h('h4', {}, 'Your full report'),
    h('button', { class:'btn', onClick:onRequestReport }, loggedIn ? 'Email me my full report' : 'Register to get full report'),
  );
  if (!loggedIn){
    wrap.appendChild(h('p', { class:'note' }, 'Register within 30 minutes after the game to get your full report. After that your answers are deleted.'));
  }
  return wrap;
}

export function pageGame({ sessionId }){
  const viewer = api.getViewer();
  const game = api.getGame(sessionId);

  let state = game.state;
  let endsAt = game.endsAt;
  let allowExtendAt = game.allowExtendAt;
  let level = game.level;
  let cardClarifyOpen = false;

  const top = TopBar({
    timerText: formatTimer(endsAt - Date.now()),
    canExtend: Date.now() >= allowExtendAt,
    onExtend: async () => { await api.extendSession(sessionId); },
    onEnd: async () => { await api.endGame(sessionId); state='summary'; render(); }
  });

  const container = h('div', { class:'container' });
  const wrap = h('div', { class:'game-wrap' },
    top,
    container
  );

  function renderLobby(){
    container.innerHTML='';
    const arena = h('div', { class:'arena' });
    const left = h('div', { class:'players' });
    placePlayers(left, game.players);

    const cardArea = h('div', { class:'card-area' });
    const startBtn = viewer.isHost ? h('button', { class:'btn reveal-btn', onClick: async ()=>{ await api.startGame(sessionId); state='running'; render(); } }, 'Start') : null;
    const card = h('div', { class:'card' }, h('div', { class:'brand' }, ''), 'Waiting to start…');
    cardArea.appendChild(card);
    if (startBtn) cardArea.appendChild(h('div', { class:'reveal-wrap' }, startBtn));

    const right = h('div');
    arena.append(left, cardArea, right);
    container.appendChild(arena);
  }

  function renderRunning(){
    container.innerHTML='';
    const arena = h('div', { class:'arena' });
    const left = h('div', { class:'players' });
    placePlayers(left, game.players);

    const cardArea = h('div', { class:'card-area' });
    const revealBtn = viewer.isHost ? h('button', { class:'reveal-btn', onClick: async ()=>{ await api.revealNext(sessionId);} }, 'Reveal next card') : null;
    if (revealBtn) cardArea.appendChild(h('div', { class:'reveal-wrap' }, revealBtn));

    const card = h('div', { class:'card' },
      h('div', { class:'brand' }, ''),
      h('div', {}, 'If you would have a superpower, what would you choose and why?'),
    );
    const levelDot = h('div', { class:'level-dot' });
    levelDot.style.background = level === 'simple' ? 'var(--simple)' : level === 'medium' ? 'var(--medium)' : 'var(--deep)';
    card.appendChild(levelDot);

    const clarify = h('div', { class:'clarify', title:'Clarification', onClick:()=>{ cardClarifyOpen=!cardClarifyOpen; pop.classList.toggle('hidden', !cardClarifyOpen); } }, '?');
    const pop = h('div', { class:'clarify-pop hidden' }, 'Short guidance or clarification text for this question.');
    card.append(clarify, pop);

    cardArea.appendChild(card);

    const controls = h('div', { class:'controls' },
      h('button', { class:'icon-btn' }, '🎤'),
      h('button', { class:'icon-btn' }, '⌨️'),
    );

    const answer = h('div', { class:'answer-sheet' },
      h('input', { class:'answer-input', placeholder:'Type your answer…', disabled: false }),
      h('button', { class:'btn secondary', onClick: async ()=>{ await api.submitAnswer(sessionId, '...'); } }, 'Submit')
    );

    const right = h('div');

    arena.append(left, cardArea, right);
    container.append(arena, controls, answer);
  }

  function renderSummary(){
    container.innerHTML='';
    const arena = h('div', { class:'arena' });
    const left = h('div', { class:'players' });
    placePlayers(left, game.players);

    const cardArea = h('div', { class:'card-area' });
    const card = h('div', { class:'card', style:{ background:'#fff', color:'#222'} },
      h('div', { class:'brand' }, ''),
      h('div', {}, 'Game Summary\nThis is a short positive summary about the selected player.'),
    );
    cardArea.appendChild(card);

    const right = SummaryCTA({
      loggedIn: !!api.getViewer().userId,
      onRequestReport: async ()=>{
        const res = await api.sendFullReport(sessionId);
        if (res?.ok) Toast('Report sent to your email');
      }
    });

    arena.append(left, cardArea, right);
    container.appendChild(arena);
  }

  function tick(){
    const now = Date.now();
    const msRemaining = Math.max(0, endsAt - now);
    top.querySelector('.timer').textContent = formatTimer(msRemaining);
    const extendBtn = top.querySelectorAll('.btn.secondary')[0];
    if (extendBtn) extendBtn.disabled = now < allowExtendAt;
  }

  function render(){
    if (state === 'lobby') renderLobby();
    else if (state === 'running') renderRunning();
    else renderSummary();
  }

  render();
  setInterval(tick, 1000);

  layout([ wrap, Footer() ]);
}