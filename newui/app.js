(function(){
  // ---------- tiny DOM/util ----------
  const $ = (sel, root=document) => root.querySelector(sel);
  function toast(msg, ms=2200){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), ms); }
  function debug(obj){ const pre=$("#debug-pre"); if(!pre) return; const s = pre.textContent + "\n" + JSON.stringify(obj,null,2); pre.textContent = s.slice(-30000); }
  function setOfflineBanner(show){ const b=$(".offline-banner"); if(!b) return; b.classList.toggle("show", !!show); }
  addEventListener("offline",()=>setOfflineBanner(true));
  addEventListener("online",()=>setOfflineBanner(false));

  // ---------- config/supabase (uses YOUR config.js & UMD) ----------
  const CONFIG = window.CONFIG || {};
  let supabase = null;
  async function ensureSupabase(){
    if (supabase) return supabase;
    const g = (typeof globalThis!=="undefined"?globalThis:window);
    if (!g.supabase) throw new Error("Supabase UMD not loaded");
    const url = CONFIG.SUPABASE_URL || g.SUPABASE_URL || g.__SUPABASE_URL || "";
    const key = CONFIG.SUPABASE_ANON_KEY || g.SUPABASE_KEY || g.__SUPABASE_KEY || "";
    supabase = g.supabase.createClient(url, key);
    return supabase;
  }
  async function getSession(){ const sb=await ensureSupabase(); const { data } = await sb.auth.getSession(); return data?.session || null; }
  async function getProfileName(){ const sb=await ensureSupabase(); const { data } = await sb.auth.getUser(); return data?.user?.user_metadata?.name || (data?.user?.email?data.user.email.split("@")[0]:"Profile"); }
  async function signOut(){ const sb=await ensureSupabase(); await sb.auth.signOut(); }

  // ---------- USE YOUR LEGACY CLIENT if present ----------
  // We probe common namespaces your existing project might expose:
  //  - window.MS_API / window.msApi / window.api
  //  - or top-level functions: create_game, join_game_guest, start_game, next_question, end_game_and_analyze, entitlement_check, get_state
  function detectLegacy(){
    const w = window;
    const ns = w.MS_API || w.msApi || w.api || w.GameAPI || w.MatchSquare?.api;
    if (ns && typeof ns === "object"){
      const hasAll = ["create_game","join_game_guest","start_game","next_question","end_game_and_analyze","entitlement_check","get_state"].every(k => typeof ns[k] === "function");
      if (hasAll) return ns;
    }
    // Fall back to global functions if they exist
    const fns = ["create_game","join_game_guest","start_game","next_question","end_game_and_analyze","entitlement_check","get_state"];
    const globals = {};
    let ok = true;
    for (const n of fns){
      const fn = window[n];
      if (typeof fn !== "function"){ ok=false; break; }
      globals[n] = fn;
    }
    return ok ? globals : null;
  }

  // ---------- helper to mirror your payload shapes ----------
  function storedRoom(){
    try{ return JSON.parse(localStorage.getItem("active_room") || sessionStorage.getItem("active_room") || "null") || {}; }catch{return {}}
  }
  function resolveCode(explicit){
    if (explicit) return explicit;
    const m = (location.hash||"").match(/^#\/game\/([^?]+)/);
    if (m) return m[1];
    const ar = storedRoom();
    return ar.game_code || ar.code || ar.id || ar.room_id || ar.roomId || ar.game_id || ar.gameId || null;
  }
  async function aliasPayload(extra, { requireGame=true } = {}){
    const session = await getSession();
    const host_user_id = session?.user?.id || null;
    const incoming = extra?.game_code || extra?.code || extra?.id || extra?.room_id || extra?.roomId || extra?.game_id || extra?.gameId || null;
    const code = resolveCode(incoming);
    if (requireGame && !code) throw new Error("Missing game id");
    const p = {
      ...(requireGame ? {
        game_code: code, code, id: code, room_id: code, roomId: code, game_id: code, gameId: code
      } : {}),
      host_user_id,
      ...extra
    };
    return p;
  }

  // ---------- supabase.functions.invoke fallback (auth header attached) ----------
  async function invokeSupabase(name, body){
    const sb = await ensureSupabase();
    const { data, error } = await sb.functions.invoke(name, { body });
    if (error) { const e = new Error(error.message||"Request failed"); e.status = error.status || undefined; throw e; }
    return data || {};
  }

  // ---------- Unified API that prefers YOUR client ----------
  const Legacy = detectLegacy();
  const API = {
    // create_game: **DO NOT** require code; pass host_user_id like your client
    createGame: async (opts) => {
      const payload = await aliasPayload(opts||{}, { requireGame:false });
      if (Legacy) return Legacy.create_game(payload);
      return invokeSupabase("create_game", payload);
    },
    joinGuest: async (p) => {
      const payload = await aliasPayload(p);
      if (Legacy) return Legacy.join_game_guest(payload);
      return invokeSupabase("join_game_guest", payload);
    },
    startGame: async (p) => {
      const payload = await aliasPayload(p);
      if (Legacy) return Legacy.start_game(payload);
      return invokeSupabase("start_game", payload);
    },
    nextQuestion: async (p) => {
      const payload = await aliasPayload(p);
      if (Legacy) return Legacy.next_question(payload);
      return invokeSupabase("next_question", payload);
    },
    endAnalyze: async (p) => {
      const payload = await aliasPayload(p);
      if (Legacy) return Legacy.end_game_and_analyze(payload);
      return invokeSupabase("end_game_and_analyze", payload);
    },
    entitlementCheck: async (p) => {
      const payload = await aliasPayload(p);
      if (Legacy) return Legacy.entitlement_check(payload);
      return invokeSupabase("entitlement_check", payload);
    },
    getState: async (p) => {
      const payload = await aliasPayload(p);
      if (Legacy) return Legacy.get_state(payload);
      // fallback
      return invokeSupabase("get_state", payload);
    }
  };

  // ---------- storage helpers ----------
  const storage = {
    set(k,v,remember=false){ (remember?localStorage:sessionStorage).setItem(k, JSON.stringify(v)); },
    get(k){ try{ const v=localStorage.getItem(k) ?? sessionStorage.getItem(k); return v?JSON.parse(v):null; }catch{ return null; } },
    del(k){ localStorage.removeItem(k); sessionStorage.removeItem(k); }
  };

  // ---------- router ----------
  const routes={};
  function route(p,h){ routes[p]=h; }
  function parseHash(){ const h=location.hash||"#/"; const [p,q]=h.split("?"); return { path:p, query:Object.fromEntries(new URLSearchParams(q)) }; }
  async function navigate(){
    const {path}=parseHash();
    const gm = path.match(/^#\/game\/(.+)$/);
    if (routes[path]) return routes[path]();
    if (gm) return pages.game(gm[1]);
    return pages.home();
  }
  addEventListener("hashchange", navigate);

  // ---------- header ----------
  async function renderHeader(){
    const session = await getSession();
    const isAuthed = !!session;
    const name = isAuthed ? await getProfileName() : null;
    const app=document.getElementById("app");
    const headerHTML = `
      <div class="header">
        <a class="brand" href="#/"><img src="./assets/logo.png" alt="logo"/><span>MatchSqr</span></a>
        <div class="right">
          ${isAuthed?`<a class="avatar-link" href="#/account" title="${name||"Account"}"><img class="avatar" src="./assets/profile.png" alt="profile"/></a>`:`<a class="btn-login" href="#/login">Login</a>`}
          <a class="btn-help" href="#/help">?</a>
        </div>
      </div>`;
    app.innerHTML = headerHTML + app.innerHTML;
  }
  function ensureDebugTray(){
    const app = document.getElementById("app");
    if (!document.getElementById("debug-tray")){
      app.insertAdjacentHTML("beforeend", `<div class="debug-tray" id="debug-tray"><pre id="debug-pre"></pre></div>`);
    }
    if (parseHash().query.debug==="1") document.getElementById("debug-tray").style.display="block";
    setOfflineBanner(!navigator.onLine);
  }

  // ---------- pages ----------
  const pages={};

  pages.home=async()=>{
    const app=document.getElementById("app");
    app.innerHTML = `
      <div class="offline-banner">You are offline. Trying to reconnect…</div>
      <section class="home-hero">
        <img class="globe" src="./assets/globe.png" alt="globe"/>
        <h1>Safe space to build meaningful connections.</h1>
        <p>Play with other people interactive games designed to uncover shared values, emotional style, interests, and personality.</p>
        <div class="cta-row">
          <a class="cta" id="ctaHost" href="#/host"><img src="./assets/crown.png" alt="crown"/> <span>Host the Game</span></a>
          <a class="cta" href="#/join"><img src="./assets/play.png" alt="play"/> <span>Join the Game</span></a>
        </div>
      </section>
      <a class="home-learn" href="#/terms">Learn more about MatchSqr</a>
    `;
    await renderHeader(); ensureDebugTray();
  };

  pages.login=async()=>{
    const app=document.getElementById("app");
    const redirectTo = sessionStorage.getItem("__redirect_after_login") || "#/";
    app.innerHTML = `
      <div class="offline-banner">You are offline. Trying to reconnect…</div>
      <div class="container">
        <div class="card" style="max-width:520px;margin:28px auto;">
          <h2>Login</h2>
          <div class="grid">
            <input id="email" class="input" placeholder="Email" type="email">
            <input id="password" class="input" placeholder="Password" type="password">
            <label><input id="remember" type="checkbox"> Remember me</label>
            <button id="loginBtn" class="btn">Login</button>
            <div style="display:flex;gap:10px;justify-content:space-between;">
              <a class="help" href="#/register">Create account</a>
              <a class="help" href="#/forgot">Forgot password?</a>
            </div>
          </div>
        </div>
      </div>
    `;
    await renderHeader(); ensureDebugTray();
    $("#loginBtn").onclick=async()=>{
      try{
        const sb=await ensureSupabase();
        const { error } = await sb.auth.signInWithPassword({ email:$("#email").value.trim(), password:$("#password").value });
        if (error) throw error;
        const remember = !!$("#remember").checked;
        storage.set("remember_me", remember, remember);
        location.hash = redirectTo;
        sessionStorage.removeItem("__redirect_after_login");
      }catch(e){ toast(e.message||"Login failed"); }
    };
  };

  pages.register=async()=>{
    const app=document.getElementById("app");
    app.innerHTML = `
      <div class="offline-banner">You are offline. Trying to reconnect…</div>
      <div class="container">
        <div class="card" style="max-width:640px;margin:28px auto;">
          <h2>Create account</h2>
          <div class="grid" style="grid-template-columns:1fr 1fr; gap:12px">
            <input id="name" class="input" placeholder="Full name">
            <input id="dob" class="input" type="date" placeholder="Date of birth">
            <select id="gender" class="input"><option value="">Gender</option><option>Female</option><option>Male</option><option>Other</option></select>
            <input id="email" class="input" placeholder="Email" type="email">
            <input id="password" class="input" placeholder="Password" type="password">
            <label style="grid-column:1/-1;"><input id="consent" type="checkbox"> I agree to the <a href="#/terms">Terms</a> and <a href="#/privacy">Privacy Policy</a></label>
            <button id="registerBtn" class="btn" style="grid-column:1/-1;">Create account</button>
            <div><a class="help" href="#/login">Already have an account? Login</a></div>
          </div>
        </div>
      </div>
    `;
    await renderHeader(); ensureDebugTray();
    $("#registerBtn").onclick=async()=>{
      if (!$("#consent").checked) return toast("Please accept Terms and Privacy");
      try{
        const sb=await ensureSupabase();
        const { error } = await sb.auth.signUp({ email:$("#email").value.trim(), password:$("#password").value, options:{ data:{ name:$("#name").value.trim(), dob:$("#dob").value, gender:$("#gender").value } } });
        if (error) throw error;
        toast("Check your email to verify"); location.hash="#/login";
      }catch(e){ toast(e.message||"Registration failed"); }
    };
  };

  pages.forgot=async()=>{
    const app=document.getElementById("app");
    app.innerHTML = `
      <div class="offline-banner">You are offline. Trying to reconnect…</div>
      <div class="container">
        <div class="card" style="max-width:520px;margin:28px auto;">
          <h2>Forgot password</h2>
          <input id="email" class="input" placeholder="Email" type="email">
          <button id="forgotBtn" class="btn" style="margin-top:8px;">Send reset link</button>
        </div>
      </div>
    `;
    await renderHeader(); ensureDebugTray();
    $("#forgotBtn").onclick=async()=>{
      try{
        const sb=await ensureSupabase();
        const { error } = await sb.auth.resetPasswordForEmail($("#email").value.trim(), { redirectTo: location.origin + "/#/reset" });
        if (error) throw error;
        toast("Reset email sent");
      }catch(e){ toast(e.message||"Failed to send"); }
    };
  };

  pages.reset=async()=>{
    const app=document.getElementById("app");
    app.innerHTML = `
      <div class="offline-banner">You are offline. Trying to reconnect…</div>
      <div class="container">
        <div class="card" style="max-width:520px;margin:28px auto;">
          <h2>Reset password</h2>
          <input id="password" class="input" placeholder="New password" type="password">
          <button id="resetBtn" class="btn" style="margin-top:8px;">Update password</button>
        </div>
      </div>
    `;
    await renderHeader(); ensureDebugTray();
    $("#resetBtn").onclick=async()=>{
      try{
        const sb=await ensureSupabase();
        const { error } = await sb.auth.updateUser({ password: $("#password").value });
        if (error) throw error;
        toast("Password updated"); location.hash="#/login";
      }catch(e){ toast(e.message||"Failed to update"); }
    };
  };

  pages.account=async()=>{
    const app=document.getElementById("app");
    const name = await getProfileName();
    app.innerHTML = `
      <div class="offline-banner">You are offline. Trying to reconnect…</div>
      <div class="container">
        <div class="card" style="max-width:720px;margin:28px auto;">
          <h2>Welcome, ${name}</h2>
          <div class="grid" style="grid-template-columns:1fr 1fr; gap:12px">
            <button id="logoutBtn" class="ghost">Logout</button>
          </div>
        </div>
      </div>
    `;
    await renderHeader(); ensureDebugTray();
    $("#logoutBtn").onclick=async()=>{ await signOut(); location.hash="#/"; };
  };

  // ---------- Host ----------
  pages.host=async()=>{
    const session = await getSession();
    if (!session){
      sessionStorage.setItem("__redirect_after_login", "#/host");
      location.hash = "#/login"; return;
    }
    const app=document.getElementById("app");
    const ar = storedRoom();
    app.innerHTML = `
      <div class="offline-banner">You are offline. Trying to reconnect…</div>
      <div class="host-wrap">
        <div class="card">
          <div class="host-head"><h2>Host a game</h2></div>
          <div id="hostControls"></div>
        </div>
      </div>`;
    await renderHeader(); ensureDebugTray();
    const el=$("#hostControls");
    if (ar && (ar.game_code || ar.code || ar.id)){
      const code = ar.game_code || ar.code || ar.id;
      el.innerHTML = `
        <div class="grid">
          <div class="inline-actions">
            <button class="primary" id="goRoom">Go to room</button>
            <button class="icon-btn" id="copyCode" title="Copy code"><img src="./assets/copy.png" alt="copy"/></button>
            <span class="help">Code: <strong>${code}</strong></span>
          </div>
        </div>`;
      $("#goRoom").onclick=()=>location.hash="#/game/"+code;
      $("#copyCode").onclick=()=>{ navigator.clipboard.writeText(code); toast("Code copied"); };
    }else{
      el.innerHTML = `
        <div class="grid">
          <button class="primary" id="createGame">Create Game</button>
          <p class="help">You will receive a game code and a room for players to join.</p>
        </div>`;
      $("#createGame").onclick=async()=>{
        try{
          const data=await API.createGame({});
          const code = data.game_code || data.code || data.id || data.room_id || data.roomId;
          if (code) localStorage.setItem("active_room", JSON.stringify({ ...data, game_code: code, code }));
          location.hash="#/host";
        }catch(e){
          // if backend signals existing room (409) and returns info in body, store & continue
          if (e.status===409 && e.data){
            const code = e.data.game_code || e.data.code || e.data.id || e.data.room_id || e.data.roomId;
            if (code){
              localStorage.setItem("active_room", JSON.stringify({ ...e.data, game_code: code, code }));
              toast("You already have an active room.");
              location.hash="#/host"; return;
            }
          }
          toast(e.message||"Failed to create"); debug({ create_game_error:e });
        }
      };
    }
  };

  // ---------- Join ----------
  pages.join=async()=>{
    const app=document.getElementById("app");
    app.innerHTML = `
      <div class="offline-banner">You are offline. Trying to reconnect…</div>
      <div class="container">
        <div class="card" style="max-width:520px;margin:28px auto;">
          <h2>Join a game</h2>
          <div class="grid">
            <input id="gameId" class="input" placeholder="Game code">
            <input id="nickname" class="input" placeholder="Nickname">
            <button id="joinBtn" class="btn" style="margin-top:8px;">Join</button>
          </div>
        </div>
      </div>
    `;
    await renderHeader(); ensureDebugTray();
    $("#joinBtn").onclick=async()=>{
      const code=$("#gameId").value.trim();
      const nickname=$("#nickname").value.trim();
      if (!code) return toast("Enter game code");
      if (!nickname) return toast("Enter nickname");
      try{
        const data=await API.joinGuest({ code, nickname });
        const stored = { ...(storedRoom()||{}), code, game_code: code, id: data?.room_id || data?.id || code };
        localStorage.setItem("active_room", JSON.stringify(stored));
        localStorage.setItem("player_id", JSON.stringify(data.player_id || data.id || null));
        location.hash="#/game/"+code;
      }catch(e){ toast(e.message||"Failed to join"); debug({ join_error:e }); }
    };
  };

  // ---------- Game Room ----------
  pages.game=async(code)=>{
    const app=document.getElementById("app");
    app.innerHTML = `
      <div class="offline-banner">You are offline. Trying to reconnect…</div>
      <div class="room-wrap">
        <div class="card main-card" id="mainCard"></div>
        <div class="controls-row" id="controlsRow"></div>
      </div>`;
    await renderHeader(); ensureDebugTray();
    Game.mount(code);
  };

  const Game={
    code:null, poller:null, tick:null,
    state:{ phase:"lobby", ends_at:null, players:[], active_player_id:null, question:null, host_user_id:null, min_players_required:2 },
    async mount(code){
      this.code=code;
      await this.refresh();
      this.startPolling();
      this.startTick();
    },
    startPolling(){ if(this.poller) clearInterval(this.poller); this.poller=setInterval(()=>this.refresh(), 3000); },
    startTick(){ if(this.tick) clearInterval(this.tick); this.tick=setInterval(()=>this.renderTimer(), 1000); },
    stop(){ if(this.poller) clearInterval(this.poller); if(this.tick) clearInterval(this.tick); },
    async refresh(){
      try{
        const data=await API.getState({ code:this.code });
        this.state = Object.assign({}, this.state, data);
        this.render();
      }catch(e){ debug({ refresh_error:e.message }); }
    },
    meIsHost(session, s){
      if (s?.me_is_host != null) return !!s.me_is_host;
      if (!session || !s?.host_user_id) return false;
      return session.user?.id === s.host_user_id;
    },
    isActivePlayer(){ try{ const me=JSON.parse(localStorage.getItem("player_id")||sessionStorage.getItem("player_id")||"null"); return me && me===this.state.active_player_id; }catch{return false;} },
    remainingSeconds(){
      if (!this.state.ends_at) return null;
      const diff = Math.floor((new Date(this.state.ends_at).getTime() - Date.now())/1000);
      return Math.max(0, diff);
    },
    renderTimer(){
      const t = this.remainingSeconds();
      const timerEl = document.getElementById("roomTimer");
      if (!timerEl) return;
      if (t==null){ timerEl.textContent = "--:--"; return; }
      const m = String(Math.floor(t/60)).padStart(2,"0");
      const s = String(t%60).padStart(2,"0");
      timerEl.textContent = `${m}:${s}`;
      const extendBtn = document.getElementById("extendBtn");
      if (extendBtn){ extendBtn.toggleAttribute("disabled", !(t<=600)); }
    },
    async render(){
      const s=this.state;
      const main=$("#mainCard"); const controls=$("#controlsRow");
      main.innerHTML=""; controls.innerHTML="";
      const session = await getSession();
      const isHost = this.meIsHost(session, s);
      const minPlayers = s.min_players_required || 2;
      const enoughPlayers = Array.isArray(s.players) ? s.players.length >= minPlayers : false;

      if (s.phase==="lobby"){
        const wrap = document.createElement("div");
        wrap.style.cssText="display:flex;flex-direction:column;align-items:center;gap:8px;";

        const startBtn = document.createElement("button");
        startBtn.className="start-round";
        startBtn.id="startGame";
        startBtn.textContent="Start";
        startBtn.disabled = !(isHost && enoughPlayers);
        startBtn.onclick=async()=>{
          if (!isHost) return toast("Only host can start");
          if (!enoughPlayers) return toast(`Need at least ${minPlayers} players`);
          try{ await API.startGame({ code:this.code }); await this.refresh(); }
          catch(e){ toast(e.message||"Start failed"); debug({ start_error:e }); }
        };

        const help = document.createElement("div");
        help.className="help";
        help.textContent = !isHost ? "Waiting for the host…" : (!enoughPlayers ? `Need at least ${minPlayers} players to start.` : "Ready to start.");

        wrap.appendChild(startBtn);
        wrap.appendChild(help);
        main.appendChild(wrap);
        return;
      }

      if (s.phase==="running"){
        const hdr = document.createElement("div");
        hdr.style.cssText = "position:absolute; top:16px; right:16px; font-weight:800;";
        hdr.innerHTML = `⏱ <span id="roomTimer">--:--</span>`;
        main.appendChild(hdr);

        const q = document.createElement("div");
        q.style.cssText = "text-align:center; max-width:640px; padding:8px";
        q.innerHTML = `<h3 style="margin:0 0 8px 0;">${s.question?.title || "Question"}</h3><p class="help" style="margin:0;">${s.question?.text || ""}</p>`;
        main.appendChild(q);

        const km = document.createElement("div");
        km.className="kb-mic-row";
        km.innerHTML = `
          <button id="micBtn" class="kb-mic-btn" ${this.isActivePlayer()?"":"disabled"}><img src="./assets/mic.png" alt="mic"/> <span>Mic</span></button>
          <button id="kbBtn" class="kb-mic-btn" ${this.isActivePlayer()?"":"disabled"}><img src="./assets/keyboard.png" alt="kb"/> <span>Keyboard</span></button>
        `;
        main.appendChild(km);

        const ans = document.createElement("div");
        ans.className="answer-row hidden";
        ans.id="answerRow";
        ans.innerHTML = `
          <input id="answerInput" class="input" placeholder="Type your answer..." ${this.isActivePlayer()?"":"disabled"}>
          <button id="submitBtn" class="btn" ${this.isActivePlayer()?"":"disabled"}>Submit</button>
        `;
        main.appendChild(ans);
        $("#micBtn").onclick=()=>{ $("#answerRow").classList.remove("hidden"); };
        $("#kbBtn").onclick=()=>{ $("#answerRow").classList.remove("hidden"); };
        $("#submitBtn").onclick=async()=>{
          if (!this.isActivePlayer()) return;
          const text=$("#answerInput").value.trim(); if (!text) return;
          try{ await API.nextQuestion({ code:this.code, answer:text }); $("#answerInput").value=""; await this.refresh(); }catch(e){ toast(e.message||"Submit failed"); debug({ submit_error:e }); }
        };

        controls.innerHTML = `
          <button id="nextCard" class="btn" ${isHost?"":"disabled"}>Reveal next card</button>
          <button id="extendBtn" class="btn secondary" disabled>Extend</button>
          <button id="endAnalyze" class="btn danger" ${isHost?"":"disabled"}>End and analyze</button>
        `;
        $("#nextCard").onclick=async()=>{ if(!isHost) return; try{ await API.nextQuestion({ code:this.code }); await this.refresh(); }catch(e){ toast(e.message||"Next failed"); debug({ next_error:e }); } };
        $("#extendBtn").onclick=()=>{ location.hash="#/billing"; };
        $("#endAnalyze").onclick=async()=>{ if(!isHost) return; try{ await API.endAnalyze({ code:this.code }); await this.refresh(); }catch(e){ toast(e.message||"End failed"); debug({ end_error:e }); } };
        this.renderTimer();
        return;
      }

      if (s.phase==="ended"){
        main.innerHTML = `
          <div style="text-align:center; max-width:640px;">
            <h3>Summary</h3>
            <p class="help">A quick view of how the game went. Full report can be emailed.</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
              <button id="emailReport" class="btn">Email me my full report</button>
              <button id="shareBtn" class="btn secondary">Share</button>
            </div>
            <p class="help" style="margin-top:10px;">Note, data is retained for about 30 minutes.</p>
          </div>`;
        $("#emailReport").onclick=()=>toast("Report requested. Check your email.");
        $("#shareBtn").onclick=()=>{ navigator.clipboard.writeText(location.href); toast("Link copied"); };
        return;
      }
    }
  };

  // ---------- Billing (simulated) ----------
  pages.billing=async()=>{
    const app=document.getElementById("app");
    app.innerHTML = `
      <div class="offline-banner">You are offline. Trying to reconnect…</div>
      <div class="container">
        <div class="card" style="max-width:720px;margin:28px auto;">
          <h2>Billing</h2>
          <div class="grid">
            <button class="btn" id="extend">Extend game by 60 min</button>
            <button class="btn secondary" id="extra">Buy extra weekly game</button>
            <button class="btn warn" id="sub">Subscribe</button>
          </div>
        </div>
      </div>
    `;
    await renderHeader(); ensureDebugTray();
    $("#extend").onclick=()=>{ toast("Simulated: extended"); };
    $("#extra").onclick=()=>toast("Simulated: extra weekly game purchased");
    $("#sub").onclick=()=>toast("Simulated: subscription active");
  };

  // ---------- static pages ----------
  pages.terms=async()=>{ const app=document.getElementById("app"); app.innerHTML = `<div class="container"><div class="card" style="margin:28px auto;max-width:840px;"><h2>Terms</h2><p class="help">…</p></div></div>`; await renderHeader(); ensureDebugTray(); };
  pages.privacy=async()=>{ const app=document.getElementById("app"); app.innerHTML = `<div class="container"><div class="card" style="margin:28px auto;max-width:840px;"><h2>Privacy</h2><p class="help">…</p></div></div>`; await renderHeader(); ensureDebugTray(); };
  pages.help=async()=>{ const app=document.getElementById("app"); app.innerHTML = `<div class="container"><div class="card" style="margin:28px auto;max-width:720px;"><h2>Help</h2><p class="help">…</p></div></div>`; await renderHeader(); ensureDebugTray(); };

  // ---------- routes & boot ----------
  route("#/", pages.home);
  route("#/host", pages.host);
  route("#/join", pages.join);
  route("#/login", pages.login);
  route("#/register", pages.register);
  route("#/forgot", pages.forgot);
  route("#/reset", pages.reset);
  route("#/account", pages.account);
  route("#/billing", pages.billing);
  route("#/terms", pages.terms);
  route("#/privacy", pages.privacy);
  route("#/help", pages.help);
  (async function(){ if (!location.hash) location.hash="#/"; navigate(); })();
})();
