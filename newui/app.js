(function(){
  window.__MS_UI_VERSION = "newui-0.5.0";

  const app = document.getElementById('app');

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

  // Home == Homepage.png layout
  function viewHome(){
    app.innerHTML = `
      <section class="ms-hero">
        <div class="ms-card">
          <h1 class="ms-title">Find meaningful connections through play</h1>
          <p class="ms-sub">Start a room to host your session, or join with a code.</p>
          <div class="ms-actions">
            <button class="ms-btn primary" id="btnCreate">Start a room</button>
            <button class="ms-btn" id="btnRejoin">Rejoin as host</button>
          </div>
        </div>
        <div class="ms-card">
          <h2 class="ms-title">Join a room</h2>
          <div class="ms-field">
            <input class="ms-input" id="inpCode" placeholder="Enter code" maxlength="8"/>
            <button class="ms-btn" id="btnJoin">Join</button>
          </div>
          <pre class="ms-sub" id="logJoin" style="margin-top:8px"></pre>
        </div>
      </section>
    `;
    const $ = (s)=>document.querySelector(s);
    $("#btnCreate").onclick = async ()=>{
      try{
        const out = await window.msApi.createGame();
        location.hash = "#/game/" + (out.id || out.game_id || "");
      }catch(e){ toast("Create failed"); }
    };
    $("#btnRejoin").onclick = async ()=>{
      const code = prompt("Enter your room code"); if (!code) return;
      try{
        const out = await window.msApi.joinGameGuest({ code: code.trim() });
        location.hash = "#/game/" + (out.id || out.game_id || "");
      }catch(e){ toast("Rejoin failed"); }
    };
    $("#btnJoin").onclick = async ()=>{
      const code = (document.getElementById('inpCode')||{}).value||'';
      if (!code){ document.getElementById('logJoin').textContent = "Please type a code"; return; }
      try{
        const out = await window.msApi.joinGameGuest({ code: code.trim() });
        location.hash = "#/game/" + (out.id || out.game_id || "");
      }catch(e){ document.getElementById('logJoin').textContent = "Join failed"; }
    };
  }

  function tplGameLobby(g){
    const seats = (g.participants||[]).map(p=>`<span class="ms-bubble">${p.display_name||('User '+p.id)}</span>`).join('');
    return `
      <div class="ms-card">
        <h2 class="ms-title">Lobby</h2>
        <div class="ms-sub">Game ID: <strong>${g.id||'-'}</strong> · Code: <strong>${g.code||'-'}</strong></div>
        <div class="ms-bubbles" style="margin-top:10px">${seats||'<span class="ms-sub">Waiting for players…</span>'}</div>
        <div class="ms-actions" style="margin-top:14px">
          <button class="ms-btn primary" id="btnStart" ${g.is_host?'':'disabled'}>Start</button>
          <button class="ms-btn" id="btnCopy">Copy code</button>
        </div>
      </div>
    `;
  }

  function tplGameRunning(g){
    const q = g.question||{};
    const isYourTurn = q && q.is_my_turn;
    const dot = q.level==='medium'?'dot-medium':(q.level==='deep'?'dot-deep':'dot-simple');
    return `
      <div class="ms-card">
        <div class="ms-level"><span class="ms-dot ${dot}"></span>${q.level||'simple'}</div>
        <div class="ms-q">${q.text||'-'}</div>
        <div class="ms-clar">${q.clarification||''}</div>
        <div class="ms-actions" style="margin-top:10px">
          <button class="ms-btn" id="btnNext" ${g.is_host?'':'disabled'}>Reveal next card</button>
          <button class="ms-btn warn" id="btnExtend">Extend</button>
          <button class="ms-btn danger" id="btnEnd" ${g.is_host?'':'disabled'}>End game</button>
        </div>
      </div>
      <div class="ms-card" style="margin-top:12px">
        <h2 class="ms-title">Your answer</h2>
        <textarea class="ms-input" id="inpAns" rows="4" placeholder="${isYourTurn?'Type your answer…':'Wait for your turn'}" ${isYourTurn?'':'disabled'}></textarea>
        <div class="ms-actions" style="margin-top:8px">
          <button class="ms-btn ok" id="btnSend" ${isYourTurn?'':'disabled'}>Send</button>
        </div>
      </div>
    `;
  }

  function tplGameSummary(g){
    const items = (g.summary_items||[]).map((s,i)=>`<div class="ms-card"><div class="ms-sub">#${i+1}</div><div>${s.text||''}</div></div>`).join('');
    return `
      <div class="ms-card">
        <h2 class="ms-title">Summary</h2>
        <div class="ms-actions">
          <button class="ms-btn" id="btnPrev">Previous</button>
          <button class="ms-btn" id="btnNextSum">Next</button>
          <button class="ms-btn ok" id="btnEmail">Email me the full report</button>
        </div>
      </div>
      <div style="display:grid;gap:8px;margin-top:12px">${items||'<div class="ms-sub">Awaiting analysis…</div>'}</div>
    `;
  }

  function render(html){ app.innerHTML = html; }
  async function pollGame(){
    try{
      const out = await window.msApi.getState({});
      const view = out.state||'lobby';
      if (view==='lobby') render(tplGameLobby(out));
      else if (view==='running') render(tplGameRunning(out));
      else render(tplGameSummary(out));
      bindGame(out);
    }catch(e){}
  }
  function startPolling(){
    if (window.__polling) clearInterval(window.__polling);
    window.__polling = setInterval(pollGame, 1200);
    pollGame();
  }

  function bindGame(g){
    const $ = (s)=>document.querySelector(s);
    const copy = $("#btnCopy"); if (copy){ copy.onclick = async ()=>{ try{ await navigator.clipboard.writeText(g.code||''); toast("Copied"); }catch{ toast("Copy failed"); } }; }
    const start = $("#btnStart"); if (start){ start.onclick = async ()=>{ try{ await window.msApi.startGame({ game_id: g.id }); toast("Started"); }catch(e){ toast("Start failed"); } };}
    const next = $("#btnNext"); if (next){ next.onclick = async ()=>{ try{ await window.msApi.nextQuestion({ game_id: g.id }); toast("Next"); }catch(e){ toast("Next failed"); } };}
    const end = $("#btnEnd"); if (end){ end.onclick = async ()=>{ try{ await window.msApi.endGameAndAnalyze({ game_id: g.id }); toast("Ended"); }catch(e){ toast("End failed"); } };}
    const send = $("#btnSend"); if (send){ send.onclick = async ()=>{ const val=(document.getElementById('inpAns')||{}).value||''; if(!val) return; try{ await window.msApi.submitAnswer({ game_id: g.id, text: val }); toast("Sent"); (document.getElementById('inpAns')||{}).value=''; }catch(e){ toast("Send failed"); } };}
  }

  function viewLogin(){
    app.innerHTML = `
      <div class="ms-row">
        <section class="ms-card">
          <h2 class="ms-title">Login</h2>
          <input class="ms-input" id="email" placeholder="Email"/>
          <input class="ms-input" id="pwd" placeholder="Password" type="password" style="margin-top:8px"/>
          <div class="ms-actions" style="margin-top:8px">
            <button class="ms-btn primary" id="doLogin">Login</button>
            <button class="ms-btn" id="goRegister">Create account</button>
          </div>
          <pre class="ms-sub" id="logLogin" style="margin-top:8px"></pre>
        </section>
      </div>
    `;
    const $ = (s)=>document.querySelector(s);
    $("#doLogin").onclick = async ()=>{
      const email = $("#email").value.trim(), pwd = $("#pwd").value;
      if (!email || !pwd){ $("#logLogin").textContent = "Email and password required"; return; }
      try{ await window.msAuth.login(email, pwd); toast("Logged in"); location.hash = "#/"; }
      catch(e){ $("#logLogin").textContent = e.message || JSON.stringify(e); }
    };
    $("#goRegister").onclick = ()=>{ location.hash = "#/register"; };
  }

  function viewRegister(){
    app.innerHTML = `
      <div class="ms-row">
        <section class="ms-card">
          <h2 class="ms-title">Create account</h2>
          <input class="ms-input" id="email" placeholder="Email"/>
          <input class="ms-input" id="pwd" placeholder="Password" type="password" style="margin-top:8px"/>
          <div class="ms-actions" style="margin-top:8px">
            <button class="ms-btn primary" id="doRegister">Register</button>
            <button class="ms-btn" id="goLogin">Back to login</button>
          </div>
          <pre class="ms-sub" id="logReg" style="margin-top:8px"></pre>
        </section>
      </div>
    `;
    const $ = (s)=>document.querySelector(s);
    $("#doRegister").onclick = async ()=>{
      const email = $("#email").value.trim(), pwd = $("#pwd").value;
      if (!email || !pwd){ $("#logReg").textContent = "Email and password required"; return; }
      try{ await window.msAuth.register(email, pwd); toast("Account created, you can log in now"); location.hash = "#/login"; }
      catch(e){ $("#logReg").textContent = e.message || JSON.stringify(e); }
    };
    $("#goLogin").onclick = ()=>{ location.hash = "#/login"; };
  }

  function viewAccount(){
    app.innerHTML = `<div class="ms-card"><h2 class="ms-title">Account</h2>
      <div class="ms-sub">Signed in</div>
      <div class="ms-actions" style="margin-top:8px"><button class="ms-btn" id="doLogout">Sign out</button></div></div>`;
    const $ = (s)=>document.querySelector(s);
    $("#doLogout").onclick = async ()=>{ await window.msAuth.logout(); toast("Signed out"); location.hash = "#/"; };
  }

  function viewHelp(){ app.innerHTML = '<div class="ms-card"><h2 class="ms-title">Help</h2><div class="ms-sub">How rooms work, privacy, and contact.</div></div>'; }

  async function route(){
    navActive();
    const h = location.hash || "#/";
    if (h==="#/" || h==="#") return viewHome();
    if (h.startsWith("#/login")) return viewLogin();
    if (h.startsWith("#/register")) return viewRegister();
    if (h.startsWith("#/account")) return viewAccount();
    if (h.startsWith("#/help")) return viewHelp();
    if (h.startsWith("#/game/")){
      app.innerHTML = '<div class="ms-sub">Connecting to room…</div>';
      return startPolling();
    }
    viewHome();
  }
  window.addEventListener('hashchange', route);
  route();
})();
