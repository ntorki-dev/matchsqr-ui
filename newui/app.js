(function(){
  // ===== Match Square UI (aligned to legacy config + endpoints) =====
  // - Uses window.CONFIG.{FUNCTIONS_BASE, FALLBACK_SUPABASE_URL, FALLBACK_SUPABASE_ANON_KEY}
  // - Uses window.supabase global (cdn script) to create client
  // - Calls edge functions via fetch(`${FUNCTIONS_BASE}/...`) like the working code
  // - Summary is rendered INSIDE the game route

  // --- Utilities ---
  const log = (...a)=>{ if (window.__DEBUG__) console.log("[MS]", ...a); };
  const $ = (s,root=document)=>root.querySelector(s);
  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
  function toast(msg, ms=2200){
    const t=document.createElement("div"); t.className="toast"; t.textContent=msg;
    document.body.appendChild(t); setTimeout(()=>t.remove(), ms);
  }

  // --- State ---
  const state = {
    supa:null, session:null, functionsBase:null,
    gameCode:null, endsAt:null, poll:null,
    players:[], active_player_id:null, phase:"lobby", question:null
  };

  // --- Config bootstrap (EXACTLY like legacy flow) ---
  async function loadConfig(){
    const baseRaw=(window.CONFIG&&window.CONFIG.FUNCTIONS_BASE)||"";
    const base = (baseRaw||"").replace(/\/$/,"");
    if(!base){ log("Please set FUNCTIONS_BASE in config.js"); return; }
    state.functionsBase = base;

    try{
      const r = await fetch(base + "/config");
      const text = await r.text();
      let cfg={}; try{ cfg = JSON.parse(text); }catch{}
      const url  = cfg.supabase_url || cfg.public_supabase_url || cfg.url || (window.CONFIG&&window.CONFIG.FALLBACK_SUPABASE_URL);
      const anon = cfg.supabase_anon_key || cfg.public_supabase_anon_key || cfg.anon || (window.CONFIG&&window.CONFIG.FALLBACK_SUPABASE_ANON_KEY);
      if(!url || !anon) throw new Error("Missing supabase url/anon");
      if(!window.supabase || !window.supabase.createClient) throw new Error("supabase-js global not loaded");
      state.supa = window.supabase.createClient(url, anon);
      log("Supabase client initialized.");
    }catch(e){
      log("Config error: " + e.message);
      toast("Config error. See console.");
    }
  }

  // --- API helpers (fetch to functions base) ---
  async function api(path, opts){
    const url = state.functionsBase + path;
    const init = Object.assign({ headers:{ "Content-Type":"application/json" }}, opts||{});
    log("API", path, opts&&opts.body ? JSON.parse(opts.body) : null);
    const res = await fetch(url, init);
    const text = await res.text();
    let data; try{ data = JSON.parse(text); }catch{ data = {}; }
    if(!res.ok){ const msg = data.message || data.error || res.statusText; throw new Error(msg); }
    log("API OK", path, data);
    return data;
  }
  const API = {
    createGame: () => api("/create_game", { method:"POST", body: "{}" }),
    joinGuest: (payload) => api("/join_game_guest", { method:"POST", body: JSON.stringify(payload) }),
    startGame: (payload) => api("/start_game", { method:"POST", body: JSON.stringify(payload) }),
    nextQuestion: (payload) => api("/next_question", { method:"POST", body: JSON.stringify(payload) }),
    endAnalyze: (payload) => api("/end_game_and_analyze", { method:"POST", body: JSON.stringify(payload) }),
    entitlementCheck: (payload) => api("/entitlement_check", { method:"POST", body: JSON.stringify(payload) }),
    getState: (code) => fetch(state.functionsBase + "/get_state?code=" + encodeURIComponent(code))
                          .then(r=>r.text()).then(t=>{ try{return JSON.parse(t);}catch{return{};} })
  };

  // --- Router ---
  function parseHash(){ const h=location.hash||"#/"; const [p,q]=h.split("?"); return { path:p, query:Object.fromEntries(new URLSearchParams(q)) }; }
  async function navigate(){
    const { path } = parseHash();
    const m = path.match(/^#\/game\/(.+)$/);
    if (path==="#/" || path==="#") return pages.home();
    if (path==="#/login") return pages.login();
    if (path==="#/register") return pages.register();
    if (path==="#/forgot") return pages.forgot();
    if (path==="#/reset") return pages.reset();
    if (path==="#/host") return pages.host();
    if (path==="#/join") return pages.join();
    if (path==="#/account") return pages.account();
    if (path==="#/billing") return pages.billing();
    if (path==="#/terms") return pages.terms();
    if (path==="#/privacy") return pages.privacy();
    if (m) return pages.game(m[1]);
    render(`<div class="container"><div class="card"><h2>Not found</h2></div></div>`);
  }
  window.addEventListener("hashchange", navigate);

  // --- Layout/Render ---
  function layout(inner){
    return `
      <div class="offline-banner" style="display:none">You are offline. Trying to reconnect…</div>
      <div class="navbar container">
        <a class="nav-logo" href="#/">
          <img src="./assets/logo.png" alt="logo" />
          <strong>Match Square</strong>
        </a>
        <div class="nav-right">
          <a class="btn ghost" href="#/host">Host</a>
          <a class="btn ghost" href="#/join">Join</a>
          <a class="btn secondary" href="#/account">
            <img class="avatar" src="./assets/profile.png" alt="profile"/>
          </a>
        </div>
      </div>
      ${inner}
      <div class="debug-tray" id="debug-tray" style="display:${parseHash().query.debug==='1'?'block':'none'}"><pre id="debug-pre"></pre></div>
      <footer class="version-footer"><span>New v2.1 (aligned)</span></footer>
    `;
  }
  function render(html){ const app=document.getElementById("app"); app.innerHTML = layout(html); }

  // --- Pages ---
  const pages = {};

  pages.home = () => {
    render(`
      <section class="container">
        <div class="grid grid-2">
          <div class="card">
            <h1>Build real connection, one game at a time.</h1>
            <p class="help">Start a game with someone new, discover compatibility through questions, then unlock chat at 90%.</p>
            <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:10px;">
              <a class="btn" href="#/host">Host a game</a>
              <a class="btn ghost" href="#/join">Join a game</a>
            </div>
          </div>
          <div class="card">
            <img src="./assets/globe.png" alt="illustration" style="width:100%; height:auto; border-radius:12px;" />
          </div>
        </div>
      </section>
    `);
  };

  pages.login = () => {
    render(`
      <section class="container" style="max-width:520px;">
        <div class="card">
          <h2>Login</h2>
          <div class="grid">
            <input id="email" class="input" placeholder="Email" type="email" autocomplete="email"/>
            <input id="password" class="input" placeholder="Password" type="password" autocomplete="current-password"/>
            <label style="display:flex; gap:8px; align-items:center;">
              <input id="remember" type="checkbox"/> Remember me
            </label>
            <button id="loginBtn" class="btn">Login</button>
            <div style="display:flex; gap:10px; justify-content:space-between;">
              <a class="help" href="#/register">Create account</a>
              <a class="help" href="#/forgot">Forgot password?</a>
            </div>
          </div>
        </div>
      </section>
    `);
    $("#loginBtn").onclick = async () => { toast("Simulated login"); location.hash="#/"; };
  };

  pages.register = () => {
    render(`
      <section class="container" style="max-width:640px;">
        <div class="card">
          <h2>Create account</h2>
          <div class="grid grid-2">
            <input id="name" class="input" placeholder="Full name"/>
            <input id="dob" class="input" placeholder="Date of birth" type="date"/>
            <select id="gender" class="select">
              <option value="">Gender</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
            <input id="email" class="input" placeholder="Email" type="email"/>
            <input id="password" class="input" placeholder="Password" type="password"/>
            <label style="grid-column:1 / -1;">
              <input id="consent" type="checkbox"/> I agree to the <a href="#/terms">Terms</a> and <a href="#/privacy">Privacy Policy</a>
            </label>
            <button id="registerBtn" class="btn" style="grid-column:1 / -1;">Create account</button>
            <div><a class="help" href="#/login">Already have an account? Login</a></div>
          </div>
        </div>
      </section>
    `);
    $("#registerBtn").onclick = () => { if(!$("#consent").checked) return toast("Please accept Terms and Privacy"); toast("Check your email to verify"); location.hash="#/login"; };
  };

  pages.forgot = () => {
    render(`
      <section class="container" style="max-width:520px;">
        <div class="card">
          <h2>Forgot password</h2>
          <input id="email" class="input" placeholder="Email" type="email"/>
          <button id="forgotBtn" class="btn" style="margin-top:10px;">Send reset link</button>
        </div>
      </section>
    `);
    $("#forgotBtn").onclick = () => toast("Reset email sent (simulated)");
  };

  pages.reset = () => {
    render(`
      <section class="container" style="max-width:520px;">
        <div class="card">
          <h2>Reset password</h2>
          <input id="password" class="input" placeholder="New password" type="password"/>
          <button id="resetBtn" class="btn" style="margin-top:10px;">Update password</button>
        </div>
      </section>
    `);
    $("#resetBtn").onclick = () => { toast("Password updated (simulated)"); location.hash="#/login"; };
  };

  pages.host = () => {
    render(`
      <section class="container">
        <div class="card">
          <h2>Host a game</h2>
          <div id="hostControls"></div>
        </div>
      </section>
    `);
    renderHostControls();
  };
  async function renderHostControls(){
    const st = JSON.parse(localStorage.getItem("active_room")||"null");
    const el = $("#hostControls");
    if (st && st.game_code){
      el.innerHTML = `
        <div class="grid">
          <div>Active room: <strong>${st.game_code}</strong></div>
          <div style="display:flex; gap:10px;">
            <button class="btn" id="goRoom">Go to room</button>
            <button class="btn ghost" id="copyLink">Copy invite</button>
          </div>
        </div>
      `;
      $("#goRoom").onclick = () => location.hash = "#/game/" + st.game_code;
      $("#copyLink").onclick = () => { navigator.clipboard.writeText(location.origin + "/#/game/" + st.game_code); toast("Link copied"); };
    }else{
      el.innerHTML = `
        <div class="grid">
          <button class="btn" id="createGame">Create Game</button>
          <p class="help">You will receive a game code and lobby page to invite players.</p>
        </div>
      `;
      $("#createGame").onclick = async () => {
        try{ const data = await API.createGame(); localStorage.setItem("active_room", JSON.stringify(data)); location.hash = "#/game/" + data.game_code; }
        catch(e){ toast(e.message||"Failed"); }
      };
    }
  }

  pages.join = () => {
    render(`
      <section class="container" style="max-width:520px;">
        <div class="card">
          <h2>Join a game</h2>
          <input id="gameId" class="input" placeholder="Game code" />
          <input id="nickname" class="input" placeholder="Nickname (optional)" />
          <button id="joinBtn" class="btn" style="margin-top:10px;">Join</button>
        </div>
      </section>
    `);
    $("#joinBtn").onclick = async () => {
      const game_code = $("#gameId").value.trim();
      const nickname = $("#nickname").value.trim() || undefined;
      if (!game_code) return toast("Enter game code");
      try{
        const data = await API.joinGuest({ game_code, nickname });
        localStorage.setItem("active_room", JSON.stringify({ game_code }));
        localStorage.setItem("player_id", JSON.stringify(data.player_id || "p2"));
        location.hash = "#/game/" + game_code;
      }catch(e){ toast(e.message||"Failed"); }
    };
  };

  pages.account = () => {
    render(`
      <section class="container" style="max-width:720px;">
        <div class="card">
          <h2>Account</h2>
          <div class="grid grid-2">
            <input id="name" class="input" placeholder="Name" />
            <input id="dob" class="input" placeholder="Date of birth" type="date"/>
            <select id="gender" class="select">
              <option value="">Gender</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
            <button id="saveProfile" class="btn">Save</button>
            <button id="sendReport" class="btn secondary">Send latest report to my email</button>
          </div>
        </div>
      </section>
    `);
    $("#sendReport").onclick = () => toast("Email requested (simulated)");
  };

  pages.terms   = () => { render(`<section class="container"><div class="card"><h2>Terms</h2><p class="help">Your terms content here.</p></div></section>`); };
  pages.privacy = () => { render(`<section class="container"><div class="card"><h2>Privacy</h2><p class="help">Your privacy policy here.</p></div></section>`); };

  pages.billing = () => {
    render(`
      <section class="container" style="max-width:720px;">
        <div class="card">
          <h2>Billing</h2>
          <div class="grid">
            <button class="btn" id="extend">Extend game by 60 min</button>
            <button class="btn secondary" id="extra">Buy extra weekly game</button>
            <button class="btn warn" id="sub">Subscribe</button>
          </div>
        </div>
      </section>
    `);
    $("#extend").onclick = () => { localStorage.setItem("sim_extend_success","true"); toast("Simulated: extended"); };
    $("#extra").onclick = () => { toast("Simulated: extra weekly game purchased"); };
    $("#sub").onclick   = () => { toast("Simulated: subscription active"); };
  };

  pages.game = (code) => {
    state.gameCode = code;
    render(`<section class="container"><div id="gameRoot"></div></section>`);
    mountGame();
  };

  async function mountGame(){
    const root = $("#gameRoot");
    root.innerHTML = `<div class="card"><h2>Game ${state.gameCode}</h2><div id="gameCard"></div></div>`;
    await refreshState();
    startPolling();
  }
  function startPolling(){ if(state.poll) clearInterval(state.poll); state.poll = setInterval(refreshState, 3500); }

  async function refreshState(){
    try{
      const data = await API.getState(state.gameCode);
      state.phase = data.phase || "lobby";
      state.endsAt = data.ends_at || null;
      state.players = data.players || [];
      state.active_player_id = data.active_player_id || null;
      state.question = data.question || null;
      renderGameCard();
    }catch(e){ log("state refresh error", e); }
  }

  function isActivePlayer(){
    try{ const me = JSON.parse(localStorage.getItem("player_id")||"null"); return me && me===state.active_player_id; }catch(_){ return false; }
  }

  function countdownText(iso){
    if (!iso) return "";
    const end = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, Math.floor((end - now)/1000));
    const m = String(Math.floor(diff/60)).padStart(2, "0");
    const s = String(diff%60).padStart(2, "0");
    return m + ":" + s;
  }

  async function renderGameCard(){
    const el = $("#gameCard");
    if (state.phase === "lobby"){
      const players = state.players.map(p=>`<li>${p.name||p.nickname||"Player"}</li>`).join("");
      el.innerHTML = `
        <div class="grid">
          <div>Share this code: <strong>${state.gameCode}</strong></div>
          <div style="display:flex; gap:10px;">
            <button class="btn" id="copyInvite">Copy invite</button>
            <button class="btn warn" id="startGame">Start</button>
          </div>
          <div class="card"><strong>Players</strong><ul>${players || "<li>No players yet</li>"}</ul></div>
        </div>
      `;
      $("#copyInvite").onclick = () => { navigator.clipboard.writeText(location.origin + "/#/game/" + state.gameCode); toast("Link copied"); };
      $("#startGame").onclick = async () => { try{ await API.startGame({ game_code:state.gameCode }); await refreshState(); }catch(e){ toast(e.message||"Failed"); } };
      return;
    }

    if (state.phase === "running"){
      const remaining = countdownText(state.endsAt);
      const canExtend = remaining && (()=>{ const [mm,ss] = remaining.split(":").map(Number); return (mm*60+ss)<=600; })();
      el.innerHTML = `
        <div class="grid">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div>
              <span class="badge-dot simple" title="Simple"></span>
              <span class="badge-dot medium" title="Medium"></span>
              <span class="badge-dot deep" title="Deep"></span>
            </div>
            <div class="timer">⏱ ${remaining || "--:--"}</div>
          </div>
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h3 style="margin:0;">${state.question?.title || "Question"}</h3>
              <button class="btn ghost" id="clarifyBtn" title="Clarification">?</button>
            </div>
            <p class="help">${state.question?.text || ""}</p>
            <div style="display:flex; gap:8px; margin-top:10px;">
              <button id="micBtn" class="btn secondary" ${isActivePlayer() ? "" : "disabled"}>
                <img src="./assets/mic.png" alt="mic" style="width:18px;height:18px;vertical-align:middle;"/> Mic
              </button>
              <input id="answer" class="input" placeholder="Type your answer..." ${isActivePlayer() ? "" : "disabled"} />
              <button id="submitBtn" class="btn" ${isActivePlayer() ? "" : "disabled"}>Submit</button>
            </div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button id="nextCard" class="btn">Reveal next card</button>
            <a class="btn secondary" href="#/billing" ${canExtend ? "" : "aria-disabled='true'"}>Extend</a>
            <button id="endAnalyze" class="btn danger">End and analyze</button>
          </div>
        </div>
        <dialog id="clarifyModal" style="padding:0; border:0; border-radius:12px; max-width:560px;">
          <div class="card">
            <h3 style="margin-top:0;">Clarification</h3>
            <p class="help">This is a short explanation about this question. Keep it brief and helpful.</p>
            <div style="text-align:right;"><button class="btn ghost" id="closeClarify">Close</button></div>
          </div>
        </dialog>
      `;
      $("#clarifyBtn").onclick = () => $("#clarifyModal").showModal();
      $("#closeClarify").onclick = () => $("#clarifyModal").close();
      $("#submitBtn")?.addEventListener("click", async () => {
        if (!isActivePlayer()) return;
        const text = $("#answer").value.trim(); if (!text) return;
        try{ await API.nextQuestion({ game_code:state.gameCode, answer:text }); $("#answer").value=""; await refreshState(); }catch(e){ toast(e.message||"Failed"); }
      });
      $("#nextCard").onclick = async () => { try{ await API.nextQuestion({ game_code:state.gameCode }); await refreshState(); }catch(e){ toast(e.message||"Failed"); } };
      $("#endAnalyze").onclick = async () => { try{ await API.endAnalyze({ game_code:state.gameCode }); await refreshState(); }catch(e){ toast(e.message||"Failed"); } };
      return;
    }

    // ended => Summary inside the room
    if (state.phase === "ended"){
      el.innerHTML = `
        <div class="grid">
          <div class="card">
            <h3>Summary</h3>
            <p class="help">A quick view of how the game went. Full report can be emailed.</p>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button id="emailReport" class="btn">Email me my full report</button>
              <button id="copyShare" class="btn secondary">
                <img src="./assets/share.png" alt="share" style="width:18px;height:18px;vertical-align:middle;"/> Share
              </button>
            </div>
            <p class="help">Note, data is retained for about 30 minutes.</p>
          </div>
        </div>
      `;
      $("#emailReport").onclick = async () => { toast("Report requested."); };
      $("#copyShare").onclick = () => { navigator.clipboard.writeText(location.href); toast("Link copied"); };
      return;
    }
  }

  // --- Boot ---
  (async function boot(){
    try {
      await loadConfig();
    } finally {
      if (!location.hash) location.hash = "#/";
      navigate();
    }
  })();

})();
