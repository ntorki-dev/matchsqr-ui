import { h, TopbarHome, TopbarGame, Footer, Toast } from './components.js';
import { api } from './api.js';

function mount(children){ const root=document.getElementById('app'); root.innerHTML=''; root.appendChild(h('div',{class:'app'}, ...children)); }
function fmt(ms){ if(ms<0)ms=0; const m=Math.floor(ms/60000), s=Math.floor((ms%60000)/1000); return `${m}:${String(s).padStart(2,'0')}m`; }

export function pageHome(){
  mount([ TopbarHome(),
    h('div',{class:'container'}, h('div',{class:'home-wrap'},
      h('div',{class:'home-hero'}, h('img',{class:'globe',src:'./assets/globe.svg',alt:''}),
        h('h1',{},'Safe space to build meaningful connections.'),
        h('p',{},'Play with other people interactive games designed to uncover shared values, emotional style, interests, and personality.'),
        h('div',{class:'home-ctas'}, h('a',{class:'btn',href:'#/host/lobby/demo'}, '👑',' Host the Game'), h('a',{class:'btn',href:'#/join'}, '▶',' Join the Game'))
      )
    )), Footer() ]);
}

export function pageLogin(){
  mount([ TopbarHome(),
    h('div',{class:'container'}, h('div',{class:'form'},
      h('h1',{},'Login'),
      h('div',{class:'row'}, h('input',{type:'email',placeholder:'Email'}), h('input',{type:'password',placeholder:'Password'})),
      h('div',{class:'row'}, h('label',{}, h('input',{type:'checkbox'}),' Remember me')),
      h('div',{class:'actions'}, h('button',{class:'btn',onClick:()=>alert('Login handler (legacy)')},'Login'), ' ', h('a',{href:'#/forgot-password',class:'link'},'Forgot password?')),
      h('div',{style:{marginTop:'10px'}}, h('a',{href:'#/register',class:'link'},'Create an account'))
    )), Footer() ]);
}

export function pageRegister(){
  mount([ TopbarHome(),
    h('div',{class:'container'}, h('div',{class:'form'},
      h('h1',{},'Create account'),
      h('div',{class:'row'}, h('input',{type:'text',placeholder:'Name'}), h('input',{type:'date',placeholder:'Date of birth'})),
      h('div',{class:'row'}, h('label',{}, h('input',{type:'radio',name:'g'}),' Man'), h('label',{}, h('input',{type:'radio',name:'g'}),' Woman')),
      h('div',{class:'row'}, h('input',{type:'email',placeholder:'Email'}), h('input',{type:'password',placeholder:'Password'})),
      h('div',{class:'row'}, h('label',{}, h('input',{type:'checkbox'}),' I agree to the ', h('a',{href:'#/terms',class:'link'},'Terms'), ' and ', h('a',{href:'#/privacy',class:'link'},'Privacy'))),
      h('div',{class:'actions'}, h('button',{class:'btn',onClick:()=>alert('Register handler (legacy)')},'Submit'))
    )), Footer() ]);
}

export function pageHostLobby({sessionId}){
  mount([ TopbarHome(),
    h('div',{class:'container'}, h('div',{class:'home-wrap',style:{textAlign:'center'}},
      h('h1',{},'Get ready. You might be surprised!'),
      h('div',{style:{margin:'18px 0'}}, h('div',{},`Game ID: ${sessionId} `), h('button',{class:'btn ghost',onClick:()=>{ navigator.clipboard.writeText(sessionId); Toast('Game ID copied'); }},'Copy')),
      h('a',{class:'btn',href:`#/game/${encodeURIComponent(sessionId)}`},'Go to room')
    )), Footer() ]);
}

function initials(name){ const first=(name||'').trim().toUpperCase().split(/\s+/)[0]||''; return first.slice(0,2)||'??'; }
function layoutPlayers(container, players){
  const cx=container.clientWidth/2, cy=container.clientHeight/2; const radius=Math.min(cx,cy)-180; const step=Math.PI*2/Math.max(players.length,1);
  players.forEach((p,i)=>{ const ang=-Math.PI/2 + i*step; const x=cx+radius*Math.cos(ang); const y=cy+radius*Math.sin(ang);
    const el=h('div',{class:'player',style:{left:(x-46)+'px',top:(y-46)+'px'}}, h('div',{}, p.initials||initials(p.name)), p.isHost?h('div',{class:'host',title:'Host'},'👑'):null, h('div',{class:'name'}, p.name)); container.appendChild(el);
  });
}

export function pageGame({sessionId}){
  const live = api.hasLegacy();
  let game = api.getGame(sessionId);
  let state = game.state;
  let endsAt = live ? game.endsAt : Date.now()+60*60*1000;
  let allowExtendAt = game.allowExtendAt;
  let level = game.level;
  let openClar = false;

  const top = TopbarGame({
    timerText: fmt(endsAt - Date.now()),
    canExtend: Date.now() >= allowExtendAt,
    onExtend: async ()=>{ await api.extendSession(sessionId); },
    onEnd: async ()=>{ await api.endGame(sessionId); state='summary'; render(); }
  });

  const container = h('div',{class:'container'});
  const shell = h('div',{class:'game'}, top,
    h('div',{class:'level-row'},
      h('div',{class:'level-item active'}, h('span',{class:'level-dot',style:{background:'#9EE2A5',border:'1px solid rgba(255,255,255,.4)'}}),'Icebreaker'),
      h('div',{class:'level-item'}, h('span',{class:'level-dot'}),'Get to know you'),
      h('div',{class:'level-item'}, h('span',{class:'level-dot'}),'The real you')
    ),
    container
  );

  if (live){
    api.onGameChanges(sessionId, (g)=>{
      game = g;
      state = g.state;
      endsAt = g.endsAt ?? endsAt;
      allowExtendAt = g.allowExtendAt ?? allowExtendAt;
      level = g.level ?? level;
      render();
    });
  }

  function renderLobby(){
    container.innerHTML='';
    const arena=h('div',{class:'arena'});
    const left=h('div',{class:'players'});
    const players = live ? (game.players||[]) : [{ id:'you', name:(api.getViewer().name||'You'), initials:initials(api.getViewer().name), isHost:true }];
    layoutPlayers(left, players);

    const cardArea=h('div',{class:'card-area'});
    const startCtl = api.getViewer().isHost ? h('div',{class:'reveal'}, h('button',{onClick: async()=>{ await api.startGame(sessionId); state='running'; render(); }},'Start')) : null;
    const card=h('div',{class:'card'}, h('div',{class:'q'},'Waiting to start...'));
    if (startCtl) cardArea.appendChild(startCtl);
    cardArea.appendChild(card);

    const right=h('div');
    arena.append(left, cardArea, right); container.appendChild(arena);
  }

  function renderRunning(){
    container.innerHTML='';
    const arena=h('div',{class:'arena'});
    const left=h('div',{class:'players'});
    const players = live ? (game.players||[]) : [{ id:'you', name:(api.getViewer().name||'You'), initials:initials(api.getViewer().name), isHost:true }];
    layoutPlayers(left, players);

    const cardArea=h('div',{class:'card-area'});
    if (api.getViewer().isHost) cardArea.appendChild(h('div',{class:'reveal'}, h('button',{onClick: async()=>{ await api.revealNext(sessionId); }},'Reveal next card')));
    const card=h('div',{class:'card'},
      h('div',{class:'level-ind',style:{background: level==='simple'?'var(--simple)': level==='medium'?'var(--medium)':'var(--deep)'}}),
      h('div',{class:'q'}, 'If you would have a superpower, what would you choose and why?')
    );
    const pop=h('div',{class:'clar-pop hidden'},'Short guidance or clarification text for this question.');
    const clar=h('div',{class:'clar',onClick:()=>{ openClar=!openClar; pop.classList.toggle('hidden', !openClar);} },'?');
    card.append(clar, pop);
    cardArea.appendChild(card);

    const controls=h('div',{class:'controls'}, h('div',{class:'icon',title:'Microphone'},'🎤'), h('div',{class:'icon',title:'Keyboard'},'⌨️'));
    const answer=h('div',{class:'answer'}, h('input',{placeholder:'Type your answer…',onkeydown:(e)=>{if(e.key==='Enter') submit();}}), h('button',{class:'btn',onclick:submit},'Submit'));
    function submit(){ api.submitAnswer(sessionId,'...'); }

    const right=h('div');
    arena.append(left, cardArea, right); container.append(arena, controls, answer);
  }

  function renderSummary(){
    container.innerHTML='';
    const arena=h('div',{class:'arena'});
    const left=h('div',{class:'players'});
    const players = live ? (game.players||[]) : [{ id:'you', name:(api.getViewer().name||'You'), initials:initials(api.getViewer().name), isHost:true }];
    layoutPlayers(left, players);

    const cardArea=h('div',{class:'card-area'});
    const card=h('div',{class:'card',style:{background:'#fff',color:'#222'}}, h('div',{class:'q'}, 'Game Summary\nThis is a short positive summary about the selected player.'));
    cardArea.appendChild(card);

    const right=h('div',{class:'summary-cta'},
      h('h4',{},'Your full report'),
      h('button',{class:'btn',onClick: async()=>{ const r=await api.sendFullReport(sessionId); if(r?.ok) Toast('Report sent to your email'); }}, api.getViewer().userId ? 'Email me my full report' : 'Register to get full report'),
      !api.getViewer().userId ? h('p',{}, 'Register within 30 minutes after the game to get your full report. After that your answers are deleted.') : null
    );

    arena.append(left, cardArea, right); container.appendChild(arena);
  }

  function tick(){
    const now=Date.now();
    const ms = (endsAt - now);
    const timer = top.querySelector('.timer'); if (timer) timer.textContent = fmt(ms);
    const ext = top.querySelector('.btn.secondary'); if (ext) ext.disabled = now < allowExtendAt;
  }

  function render(){
    if (state==='lobby') renderLobby();
    else if (state==='running') renderRunning();
    else renderSummary();
  }

  render();
  setInterval(tick, 1000);
  mount([ shell, Footer() ]);
}