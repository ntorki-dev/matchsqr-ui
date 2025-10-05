(function(){
  // ---------- utilities ----------
  const $ = (sel, root=document) => root.querySelector(sel);
  function toast(msg, ms=2200){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), ms); }
  function debug(obj){ const pre=$("#debug-pre"); if(!pre) return; const s = pre.textContent + "\n" + JSON.stringify(obj,null,2); pre.textContent = s.slice(-30000); }
  function setOfflineBanner(show){ const b=$(".offline-banner"); if(!b) return; b.classList.toggle("show", !!show); }
  window.addEventListener("offline",()=>setOfflineBanner(true));
  window.addEventListener("online",()=>setOfflineBanner(false));

  // ---------- config / supabase (uses your existing config.js and UMD) ----------
  const CONFIG = window.CONFIG || {};
  const FUNCTIONS_BASE = (CONFIG.FUNCTIONS_BASE || "").replace(/\/+$/,""); // trim trailing /
  let supabase = null;
  async function ensureSupabase(){
    if (supabase) return supabase;
    const g = (typeof globalThis!=="undefined"?globalThis:window);
    if (!g.supabase) throw new Error("Supabase UMD not loaded");
    let url = CONFIG.SUPABASE_URL || CONFIG.FALLBACK_SUPABASE_URL || g.SUPABASE_URL || g.__SUPABASE_URL || "";
    let key = CONFIG.SUPABASE_ANON_KEY || CONFIG.FALLBACK_SUPABASE_ANON_KEY || g.SUPABASE_KEY || g.__SUPABASE_KEY || "";
    try{
      const res = await fetch(FUNCTIONS_BASE + "/config");
      if (res.ok){ const c=await res.json(); url = c.supabase_url || url; key = c.supabase_anon_key || key; }
    }catch(e){}
    supabase = g.supabase.createClient(url, key);
    return supabase;
  }
  async function getSession(){ const sb=await ensureSupabase(); const { data } = await sb.auth.getSession(); return data?.session || null; }
  async function getProfileName(){ const sb=await ensureSupabase(); const { data } = await sb.auth.getUser(); return data?.user?.user_metadata?.name || (data?.user?.email?data.user.email.split("@")[0]:"Profile"); }
  async function signOut(){ const sb=await ensureSupabase(); await sb.auth.signOut(); }

  // ---------- Edge Functions helper (AUTH FIX) ----------
  async function invoke(name, body){
    const sb = await ensureSupabase();
    // Prefer official invoke (it forwards Authorization automatically)
    try{
      const { data, error } = await sb.functions.invoke(name, { body });
      if (error) throw error;
      return data || {};
    }catch(err){
      // Fallback: manual fetch with Authorization header
      const session = await getSession();
      const token = session?.access_token || "";
      const url = `${sb.functions.url}/${encodeURIComponent(name)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type":"application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
      const text = await res.text();
      let data=null; try{ data = JSON.parse(text); }catch{}
      if (!res.ok) throw new Error((data && (data.message||data.error)) || text || "Request failed");
      return data || {};
    }
  }

  // GET helper (used only for get_state if your function expects GET)
  async function getWithAuth(url){
    const sb = await ensureSupabase();
    const session = await getSession();
    const token = session?.access_token || "";
    const res = await fetch(url, { headers: token ? { Authorization:`Bearer ${token}` } : {} });
    const text = await res.text();
    let data=null; try{ data = JSON.parse(text); }catch{}
    if (!res.ok) throw new Error((data && (data.message||data.error)) || text || "Request failed");
    return data || {};
  }

  const API = {
    createGame: (opts)=> invoke("create_game", opts||{}),
    joinGuest: (p)=> invoke("join_game_guest", p),
    startGame: (p)=> invoke("start_game", p),
    nextQuestion: (p)=> invoke("next_question", p),
    endAnalyze: (p)=> invoke("end_game_and_analyze", p),
    entitlementCheck: (p)=> invoke("entitlement_check", p),
    getState: async (p)=>{
      // If your get_state supports GET:
      if (FUNCTIONS_BASE){
        const safeBase = FUNCTIONS_BASE; // already trimmed
        const url = `${safeBase}/get_state?code=${encodeURIComponent(p.game_code || p.code || "")}`;
        return getWithAuth(url);
      }
      // Otherwise use invoke:
      return invoke("get_state", { code: p.game_code || p.code || "" });
    }
  };

  // ---------- storage ----------
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
  window.addEventListener("hashchange", navigate);

  // ---------- layout ----------
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
        const payload={ name:$("#name").value.trim(), dob:$("#dob").value, gender:$("#gender").value, email:$("#email").value.trim(), password:$("#password").value };
        const { error } = await sb.auth.signUp({ email:payload.email, password:payload.password, options:{ data:{ name:payload.name, dob:payload.dob, gender:payload.gender } } });
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

  // Host requires login
  pages.host=async()=>{
    const session = await getSession();
    if (!session){
      sessionStorage.setItem("__redirect_after_login", "#/host");
      location.hash = "#/login"; return;
    }
    const app=document.getElementById("app");
    const ar = storage.get("active_room");
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
    if (ar && ar.game_code){
      el.innerHTML = `
        <div class="grid">
          <div class="inline-actions">
            <button class="primary" id="goRoom">Go to room</button>
            <button class="icon-btn" id="copyCode" title="Copy code"><img src="./assets/copy.png" alt="copy"/></button>
            <span class="help">Code: <strong>${ar.game_code}</strong></span>
          </div>
        </div>`;
      $("#goRoom").onclick=()=>location.hash="#/game/"+ar.game_code;
      $("#copyCode").onclick=()=>{ navigator.clipboard.writeText(ar.game_code); toast("Code copied"); };
    }else{
      el.innerHTML = `
        <div class="grid">
          <button class="primary" id="createGame">Create Game</button>
          <p class="help">You will receive a game code and a room for players to join.</p>
        </div>`;
      $("#createGame").onclick=async()=>{
        try{ const data=await API.createGame({}); storage.set("active_room", data, true); location.hash="#/host"; }
        catch(e){ toast(e.message||"Failed to create"); }
      };
    }
  };

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
      const game_code=$("#gameId").value.trim();
      const nickname=$("#nickname").value.trim();
      if (!game_code) return toast("Enter game code");
      if (!nickname) return toast("Enter nickname");
      try{
        const data=await API.joinGuest({ game_code, nickname }); // nickname required
        storage.set("active_room",{ game_code },true);
        storage.set("player_id", data.player_id, true);
        location.hash="#/game/"+game_code;
      }catch(e){ toast(e.message||"Failed to join"); }
    };
  };

  // ---------- game ----------
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
    state:{ phase:"lobby", ends_at:null, players:[], active_player_id:null, question:null },
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
        const data=await API.getState({ game_code:this.code });
        this.state = Object.assign({}, this.state, data);
        this.render();
      }catch(e){ debug({ refresh_error:e.message }); }
    },
    isActivePlayer(){ const me=storage.get("player_id"); return me && me===this.state.active_player_id; },
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
    render(){
      const s=this.state;
      const main=$("#mainCard"); const controls=$("#controlsRow");
      main.innerHTML=""; controls.innerHTML="";
      if (s.phase==="lobby"){
        // in-room lobby: centered round Start; no copy invite here
        const startBtn = document.createElement("button");
        startBtn.className="start-round";
        startBtn.id="startGame";
        startBtn.textContent="Start";
        startBtn.onclick=async()=>{
          try{ await API.startGame({ game_code:this.code }); await this.refresh(); }
          catch(e){ toast(e.message||"Start failed"); }
        };
        main.appendChild(startBtn);
        return;
      }
      if (s.phase==="running"){
        // timer
        const hdr = document.createElement("div");
        hdr.style.cssText = "position:absolute; top:16px; right:16px; font-weight:800;";
        hdr.innerHTML = `⏱ <span id="roomTimer">--:--</span>`;
        main.appendChild(hdr);
        // question
        const q = document.createElement("div");
        q.style.cssText = "text-align:center; max-width:640px; padding:8px";
        q.innerHTML = `<h3 style="margin:0 0 8px 0;">${s.question?.title || "Question"}</h3><p class="help" style="margin:0;">${s.question?.text || ""}</p>`;
        main.appendChild(q);
        // mic/keyboard
        const km = document.createElement("div");
        km.className="kb-mic-row";
        km.innerHTML = `
          <button id="micBtn" class="kb-mic-btn" ${this.isActivePlayer()?"":"disabled"}><img src="./assets/mic.png" alt="mic"/> <span>Mic</span></button>
          <button id="kbBtn" class="kb-mic-btn" ${this.isActivePlayer()?"":"disabled"}><img src="./assets/keyboard.png" alt="kb"/> <span>Keyboard</span></button>
        `;
        main.appendChild(km);
        // answer (hidden until mic/keyboard)
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
          try{ await API.nextQuestion({ game_code:this.code, answer:text }); $("#answerInput").value=""; await this.refresh(); }catch(e){ toast(e.message||"Submit failed"); }
        };
        // controls
        controls.innerHTML = `
          <button id="nextCard" class="btn">Reveal next card</button>
          <button id="extendBtn" class="btn secondary" disabled>Extend</button>
          <button id="endAnalyze" class="btn danger">End and analyze</button>
        `;
        $("#nextCard").onclick=async()=>{ try{ await API.nextQuestion({ game_code:this.code }); await this.refresh(); }catch(e){ toast(e.message||"Next failed"); } };
        $("#extendBtn").onclick=()=>{ location.hash="#/billing"; };
        $("#endAnalyze").onclick=async()=>{ try{ await API.endAnalyze({ game_code:this.code }); await this.refresh(); }catch(e){ toast(e.message||"End failed"); } };
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

  // ---------- basic pages ----------
  pages.terms=async()=>{ const app=document.getElementById("app"); app.innerHTML = `<div class="container"><div class="card" style="margin:28px auto;max-width:840px;"><h2>Terms</h2><p class="help">…</p></div></div>`; await renderHeader(); ensureDebugTray(); };
  pages.privacy=async()=>{ const app=document.getElementById("app"); app.innerHTML = `<div class="container"><div class="card" style="margin:28px auto;max-width:840px;"><h2>Privacy</h2><p class="help">…</p></div></div>`; await renderHeader(); ensureDebugTray(); };
  pages.help=async()=>{ const app=document.getElementById("app"); app.innerHTML = `<div class="container"><div class="card" style="margin:28px auto;max-width:720px;"><h2>Help</h2><p class="help">…</p></div></div>`; await renderHeader(); ensureDebugTray(); };

  // ---------- routes ----------
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

  // ---------- boot ----------
  (async function(){ if (!location.hash) location.hash="#/"; navigate(); })();
})();
