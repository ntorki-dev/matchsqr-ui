(function(){
  window.__MS_UI_VERSION = "newui-0.1.0";

  const app = document.getElementById('app');
  const uiVer = document.getElementById('uiVer'); if (uiVer) uiVer.textContent = window.__MS_UI_VERSION;

  const state = {
    session: null, // { access_token }
    gameId: null,
    gameCode: null,
    isHost: false,
    mePid: null,
    polling: null
  };

  function toast(msg){
    const t = document.getElementById('toast'); if(!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'), 2000);
  }

  function navActive(){
    ['nav-home','nav-login','nav-account','nav-help'].forEach(id=>{
      const el = document.getElementById(id); if (!el) return;
      const href = el.getAttribute('href');
      el.classList.toggle('active', location.hash === href);
    });
  }

  function tplHome(){
    const email = (window.__session_email||'');
    return `
      <div class="grid">
        <section class="card">
          <h2>Start a room</h2><div class="meta">Session: <span id="sessMeta"></span></div>
          <div class="meta">Only the host can start and reveal next cards</div>
          <div class="actions" style="margin-top:10px">
            <button class="btn primary" id="btnCreate">Create room</button>
            <button class="btn" id="btnRejoin">Rejoin as host</button>
          </div>
          <pre class="meta" id="logHome" style="margin-top:10px"></pre>
        </section>

        <section class="card">
          <h2>Join a room</h2>
          <div class="meta">Guests can join with a code</div>
          <input class="input" id="inpCode" placeholder="Enter code" maxlength="8"/>
          <div class="actions" style="margin-top:8px">
            <button class="btn" id="btnJoin">Join</button>
          </div>
          <pre class="meta" id="logJoin" style="margin-top:10px"></pre>
        </section>
      </div>
    `;
  }

  function tplGameLobby(g){
    const seats = (g.participants||[]).map(p=>`<span class="bubble">${p.display_name||('User '+p.id)}</span>`).join('');
    return `
      <div class="card">
        <div class="meta">Game ID: <strong>${g.id||'-'}</strong> · Code: <strong>${g.code||'-'}</strong></div>
        <h2>Lobby</h2>
        <div class="bubbles">${seats||'<span class="meta">Waiting for players…</span>'}</div>
        <div class="actions" style="margin-top:12px">
          <button class="btn primary" id="btnStart" ${state.isHost?'':'disabled'}>Start</button>
          <button class="btn ghost" id="btnCopy">Copy code</button>
        </div>
      </div>
    `;
  }

  function tplGameRunning(g){
    const q = g.question||{};
    const you = (g.participants||[]).find(p=>String(p.id)===String(state.mePid));
    const isYourTurn = you && q.current_participant_id && String(q.current_participant_id)===String(you.id);
    const dotClass = q.level==='medium'?'level-medium':(q.level==='deep'?'level-deep':'level-simple');
    return `
      <div class="card">
        <div class="meta"><span class="level-dot ${dotClass}"></span>${q.level||'simple'} · <span class="timer" id="roundTimer">${g.round_remaining||''}</span></div>
        <div class="question" id="qText">${q.text||'-'}</div>
        <div class="meta" id="qClar">${q.clarification||''}</div>
        <div class="actions" style="margin-top:12px">
          <button class="btn" id="btnNext" ${state.isHost?'':'disabled'}>Reveal next card</button>
          <button class="btn warn" id="btnExtend">Extend</button>
          <button class="btn danger" id="btnEnd" ${state.isHost?'':'disabled'}>End game</button>
        </div>
      </div>

      <div class="card" style="margin-top:12px">
        <h2>Your answer</h2>
        <textarea class="input" id="inpAns" rows="4" placeholder="${isYourTurn?'Type your answer…':'Wait for your turn'}" ${isYourTurn?'':'disabled'}></textarea>
        <div class="actions" style="margin-top:8px">
          <button class="btn ok" id="btnSend" ${isYourTurn?'':'disabled'}>Send</button>
        </div>
      </div>
    `;
  }

  function tplGameSummary(g){
    const items = (g.summary_items||[]).map((s,i)=>`<div class="card"><div class="meta">#${i+1}</div><div>${s.text||''}</div></div>`).join('');
    return `
      <div class="card">
        <h2>Summary</h2>
        <div class="actions">
          <button class="btn" id="btnPrev">Previous</button>
          <button class="btn" id="btnNextSum">Next</button>
          <button class="btn ok" id="btnEmail">Email me the full report</button>
        </div>
      </div>
      <div style="display:grid;gap:8px;margin-top:12px">${items||'<div class="meta">Awaiting analysis…</div>'}</div>
    `;
  }

  function render(html){ app.innerHTML = html; }

  async function pollGame(){
    try{
      const body = state.gameId ? { game_id: state.gameId } : (state.gameCode ? { code: state.gameCode } : {});
      const out = await window.msApi.getState(body, state.session && state.session.access_token);
      state.gameId = out.id || state.gameId;
      state.gameCode = out.code || state.gameCode;
      state.isHost = !!out.is_host;
      const view = out.state||'lobby';
      if (view==='lobby') render(tplGameLobby(out));
      else if (view==='running') render(tplGameRunning(out));
      else render(tplGameSummary(out));
      bindGame(out);
    }catch(e){
      // silent transient errors
    }
  }

  function startPolling(){
    if (state.polling) clearInterval(state.polling);
    state.polling = setInterval(pollGame, 1500);
    pollGame();
  }

  function bindGame(g){
    const $ = (s)=>document.querySelector(s);
    const copy = $("#btnCopy");
    if (copy){ copy.onclick = async ()=>{ try{ await navigator.clipboard.writeText(g.code||''); toast("Copied"); }catch{ toast("Copy failed"); } }; }
    const start = $("#btnStart");
    if (start){ start.onclick = async ()=>{
      try{ await window.msApi.startGame({ game_id: state.gameId||g.id }, state.session && state.session.access_token); toast("Started"); }catch(e){ toast("Start failed"); }
    };}
    const next = $("#btnNext");
    if (next){ next.onclick = async ()=>{
      try{ await window.msApi.nextQuestion({ game_id: state.gameId||g.id }, state.session && state.session.access_token); toast("Next"); }catch(e){ toast("Next failed"); }
    };}
    const end = $("#btnEnd");
    if (end){ end.onclick = async ()=>{
      try{ await window.msApi.endGameAndAnalyze({ game_id: state.gameId||g.id }, state.session && state.session.access_token); toast("Ended"); }catch(e){ toast("End failed"); }
    };}
    const send = $("#btnSend");
    if (send){ send.onclick = async ()=>{
      const val = (document.getElementById('inpAns')||{}).value||'';
      if (!val) return;
      try{
        await window.msApi.submitAnswer({ game_id: state.gameId||g.id, text: val }, state.session && state.session.access_token);
        toast("Sent");
        (document.getElementById('inpAns')||{}).value='';
      }catch(e){ toast("Send failed"); }
    };}
  }

  async function bindHome(){
    const sess = await window.msAuth.session();
    const sEl = document.getElementById('sessMeta');
    if (sEl){
      sEl.textContent = sess ? 'active' : 'not signed in';
    }
    const $ = (s)=>document.querySelector(s);
    const logHome = $("#logHome");
    const logJoin = $("#logJoin");

    $("#btnCreate").onclick = async ()=>{
      try{
        if (!state.session || !state.session.access_token){ logHome.textContent = "Please login first"; return; }
        const out = await window.msApi.createGame(state.session.access_token);
        state.gameId = out.game_id || out.id || null;
        state.gameCode = out.code || null;
        location.hash = "#/game/" + (state.gameId || "");
      }catch(e){ logHome.textContent = "Create failed: "+(e.body?JSON.stringify(e.body):e.message); }
    };

    $("#btnRejoin").onclick = async ()=>{
      if (!state.session || !state.session.access_token){ logHome.textContent = "Please login first"; return; }
      const code = prompt("Enter your room code");
      if (!code) return;
      try{
        const body = { code: code.trim() };
        const out = await window.msApi.joinGameGuest(body, state.session.access_token);
        state.gameId = out.game_id || out.id || null;
        state.gameCode = out.code || code.trim();
        state.isHost = !!out.is_host;
        location.hash = "#/game/" + (state.gameId || "");
      }catch(e){ logHome.textContent = "Rejoin failed: "+(e.body?JSON.stringify(e.body):e.message); }
    };

    $("#btnJoin").onclick = async ()=>{
      const code = (document.getElementById('inpCode')||{}).value||'';
      if (!code){ logJoin.textContent = "Please type a code"; return; }
      try{
        const out = await window.msApi.joinGameGuest({ code: code.trim() }, state.session && state.session.access_token);
        state.gameId = out.game_id || out.id || null;
        state.gameCode = out.code || code.trim();
        state.isHost = !!out.is_host;
        state.mePid = out.participant_id || state.mePid;
        location.hash = "#/game/" + (state.gameId || "");
      }catch(e){ logJoin.textContent = "Join failed: "+(e.body?JSON.stringify(e.body):e.message); }
    };
  }

  function viewHome(){ render(tplHome()); bindHome(); }
  
function viewLogin(){
  render(`
    <div class="grid">
      <section class="card">
        <h2>Login</h2>
        <input class="input" id="email" placeholder="Email"/>
        <input class="input" id="pwd" placeholder="Password" type="password" style="margin-top:8px"/>
        <div class="actions" style="margin-top:8px">
          <button class="btn primary" id="doLogin">Login</button>
          <button class="btn" id="goRegister">Create account</button>
        </div>
        <pre class="meta" id="logLogin" style="margin-top:8px"></pre>
      </section>
    </div>
  `);
  const $ = (s)=>document.querySelector(s);
  $("#doLogin").onclick = async ()=>{
    const email = $("#email").value.trim(), pwd = $("#pwd").value;
    if (!email || !pwd){ $("#logLogin").textContent = "Email and password required"; return; }
    try{
      await window.msAuth.login(email, pwd);
      window.__session_email = email;
      toast("Logged in");
      location.hash = "#/";
    }catch(e){
      $("#logLogin").textContent = e.message || JSON.stringify(e);
    }
  };
  $("#goRegister").onclick = ()=>{ location.hash = "#/register"; };
}

function viewAccount(){
  render(`<div class="card">
    <h2>Account</h2>
    <div class="meta">Signed in as: ${window.__session_email||''}</div>
    <div class="actions" style="margin-top:8px">
      <button class="btn" id="doLogout">Sign out</button>
    </div>
  </div>`);
  const $ = (s)=>document.querySelector(s);
  $("#doLogout").onclick = async ()=>{ await window.msAuth.logout(); window.__session_email=''; toast("Signed out"); location.hash = "#/"; };
}
function viewRegister(){
  render(`
    <div class="grid">
      <section class="card">
        <h2>Create account</h2>
        <input class="input" id="email" placeholder="Email"/>
        <input class="input" id="pwd" placeholder="Password" type="password" style="margin-top:8px"/>
        <div class="actions" style="margin-top:8px">
          <button class="btn primary" id="doRegister">Register</button>
          <button class="btn" id="goLogin">Back to login</button>
        </div>
        <pre class="meta" id="logReg" style="margin-top:8px"></pre>
      </section>
    </div>
  `);
  const $ = (s)=>document.querySelector(s);
  $("#doRegister").onclick = async ()=>{
    const email = $("#email").value.trim(), pwd = $("#pwd").value;
    if (!email || !pwd){ $("#logReg").textContent = "Email and password required"; return; }
    try{
      await window.msAuth.register(email, pwd);
      toast("Account created, you can log in now");
      location.hash = "#/login";
    }catch(e){
      $("#logReg").textContent = e.message || JSON.stringify(e);
    }
  };
  $("#goLogin").onclick = ()=>{ location.hash = "#/login"; };
}

  function viewHelp(){ render('<div class="card"><h2>Help</h2><div class="meta">How rooms work, privacy, and contact.</div></div>'); }

  async function route(){
    navActive();
    const h = location.hash || "#/";
    if (h==="#/" || h==="#") return viewHome();
    if (h.startsWith("#/login")) return viewLogin();
    if (h.startsWith("#/register")) return viewRegister();
    if (h.startsWith("#/account")) return viewAccount();
    if (h.startsWith("#/help")) return viewHelp();
    if (h.startsWith("#/game/")){
      render('<div class="meta">Connecting to room…</div>');
      startPolling();
      return;
    }
    viewHome();
  }

  window.addEventListener('hashchange', route);
  route();
})();
