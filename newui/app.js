(function(){
  // ===== Utilities =====
  const log = (...args)=>{ if (window.__DEBUG__) console.log("[MS]", ...args); };
  const $ = (sel, root=document)=> root.querySelector(sel);
  const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
  function toast(msg, ms=2200){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), ms); }
  function debug(obj){ const pre=$("#debug-pre"); if(!pre) return; const s=pre.textContent+"\n"+JSON.stringify(obj,null,2); pre.textContent=s.slice(-30000); }
  function setOfflineBanner(show){ const b=$(".offline-banner"); if(!b) return; b.classList.toggle("show", !!show); }
  window.addEventListener("offline",()=>setOfflineBanner(true));
  window.addEventListener("online",()=>setOfflineBanner(false));

  // ===== Config & Supabase (preserve working pattern) =====
  const CONFIG = window.CONFIG || {};
  const FUNCTIONS_BASE = CONFIG.FUNCTIONS_BASE || "";
  let supabase = null;
  async function ensureSupabase(){
    if (supabase) return supabase;
    const g=(typeof globalThis!=="undefined"?globalThis:window);
    if (!g.supabase) throw new Error("Supabase UMD not loaded");
    let url = CONFIG.SUPABASE_URL || CONFIG.FALLBACK_SUPABASE_URL || g.SUPABASE_URL || g.__SUPABASE_URL || "";
    let key = CONFIG.SUPABASE_ANON_KEY || CONFIG.FALLBACK_SUPABASE_ANON_KEY || g.SUPABASE_KEY || g.__SUPABASE_KEY || "";
    try{
      const res=await fetch(FUNCTIONS_BASE + "/config");
      if (res.ok){ const c=await res.json(); url=c.supabase_url||url; key=c.supabase_anon_key||key; }
    }catch(e){ log("config endpoint skipped", e); }
    supabase = g.supabase.createClient(url, key);
    return supabase;
  }

  // ===== API via fetch (no supabase.functions.invoke) =====
  async function edge(path, { method="POST", body }={}){
    if (window.__MOCK__) return Mock.edge(path, {method, body});
    const url = FUNCTIONS_BASE + path;
    debug({ edge:{ url, method, body } });
    const res = await fetch(url, { method, headers:{"Content-Type":"application/json"}, body: body?JSON.stringify(body):undefined });
    const text = await res.text();
    let data=null; try{ data=JSON.parse(text); }catch{}
    debug({ edge_result:{ status:res.status, data, text:data?undefined:text } });
    if (!res.ok) throw new Error((data&&data.message) || text || "Request failed");
    return data || {};
  }
  const API = {
    createGame: (opts)=> edge("/create_game",{ body:opts||{} }),
    joinGuest: (p)=> edge("/join_game_guest",{ body:p }),
    startGame: (p)=> edge("/start_game",{ body:p }),
    nextQuestion: (p)=> edge("/next_question",{ body:p }),
    endAnalyze: (p)=> edge("/end_game_and_analyze",{ body:p }),
    entitlementCheck: (p)=> edge("/entitlement_check",{ body:p }),
    getState: async (p)=>{
      if (window.__MOCK__) return Mock.edge("/get_state",{method:"GET", body:p});
      const url = FUNCTIONS_BASE + "/get_state?code=" + encodeURIComponent(p.game_code||p.code||"");
      debug({ edge:{ url, method:"GET" } });
      const res = await fetch(url); const data = await res.json();
      debug({ edge_result:{ status:res.status, data } });
      if (!res.ok) throw new Error((data&&data.message)||"get_state failed");
      return data;
    }
  };

  // ===== Mock DB (only for optional local test) =====
  const Mock = {
    db:{ code:"ABCD12", phase:"lobby", ends_at:null, idx:0, players:[{id:"p1",name:"Host"},{id:"p2",name:"Guest"}], active:"p1",
      qs:[{title:"Q1",text:"What energizes you lately?"},{title:"Q2",text:"What does a perfect day look like for you?"}] },
    async edge(path,{method,body}){
      const S=this.db;
      if (path==="/create_game") return { game_code:S.code };
      if (path==="/join_game_guest") return { player_id:"p2" };
      if (path==="/start_game"){ S.phase="running"; S.ends_at=new Date(Date.now()+20*60*1000).toISOString(); return { ok:true }; }
      if (path==="/next_question"){ if (body&&body.answer){} S.idx=Math.min(S.idx+1,S.qs.length-1); S.active=(S.active==="p1")?"p2":"p1"; return { ok:true }; }
      if (path==="/end_game_and_analyze"){ S.phase="ended"; return { ok:true }; }
      if (path==="/entitlement_check"){ return { ok:true }; }
      if (path==="/get_state"){ return { phase:S.phase, ends_at:S.ends_at, players:S.players, active_player_id:S.active, question:S.qs[S.idx]||null }; }
      return { ok:true };
    }
  };

  // ===== Storage (preserve keys) =====
  const storage = {
    set(k,v,remember=false){ (remember?localStorage:sessionStorage).setItem(k, JSON.stringify(v)); },
    get(k){ try{ const v=localStorage.getItem(k)??sessionStorage.getItem(k); return v?JSON.parse(v):null; }catch{ return null; } },
    del(k){ localStorage.removeItem(k); sessionStorage.removeItem(k); }
  };

  // ===== Router =====
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

  // ===== Layout =====
  function navHome(){
    return `<div class="nav home">
      <a class="brand" href="#/"><img src="./assets/logo.png" alt="logo"/><span>MatchSqr</span></a>
      <div class="right">
        <a class="btn-login" href="#/login">Login</a>
        <a class="btn-help" href="#/help">?</a>
      </div>
    </div>`;
  }
  function navApp(){
    return `<div class="nav app container">
      <a class="brand" href="#/"><img src="./assets/logo.png" alt="logo"/><span>MatchSqr</span></a>
      <div class="right">
        <a class="btn ghost" href="#/host">Host</a>
        <a class="btn ghost" href="#/join">Join</a>
      </div>
    </div>`;
  }
  function render(content, variant="app"){
    const app=document.getElementById("app");
    app.innerHTML = `
      <div class="offline-banner">You are offline. Trying to reconnect…</div>
      ${variant==="home"? navHome(): navApp()}
      ${content}
      <div class="debug-tray" id="debug-tray"><pre id="debug-pre"></pre></div>`;
    if (parseHash().query.debug==="1") $("#debug-tray").style.display="block";
    setOfflineBanner(!navigator.onLine);
  }

  // ===== Pages (markup rebased to screens) =====
  const pages={};

  pages.home=()=>{
    render(`
      <section class="hero">
        <img class="globe" src="./assets/globe.png" alt="globe"/>
        <h1>Safe space to build meaningful connections.</h1>
        <p>Play with other people interactive games designed to uncover shared values, emotional style, interests, and personality.</p>
        <div class="cta-row">
          <a class="cta" href="#/host"><img src="./assets/crown.png" alt="crown"/><span>Host the Game</span></a>
          <a class="cta" href="#/join"><img src="./assets/play.png" alt="play"/><span>Join the Game</span></a>
        </div>
      </section>
      <a class="learn-more" href="#/terms">Learn more about MatchSqr</a>
    `, "home");
  };

  pages.host=()=>{
    render(`<section class="container"><div class="card"><h2>Host a game</h2><div id="hostControls"></div></div></section>`);
    const state=storage.get("active_room");
    const el=$("#hostControls");
    if (state && state.game_code){
      el.innerHTML = `
        <div class="grid">
          <div>Active room: <strong>${state.game_code}</strong></div>
          <div style="display:flex; gap:10px;">
            <button class="btn" id="goRoom">Go to room</button>
            <button class="btn ghost" id="copyLink">Copy invite</button>
          </div>
        </div>`;
      $("#goRoom").onclick=()=>location.hash="#/game/"+state.game_code;
      $("#copyLink").onclick=()=>{ navigator.clipboard.writeText(location.origin + "/#/game/" + state.game_code); toast("Link copied"); };
    }else{
      el.innerHTML = `
        <div class="grid">
          <button class="btn" id="createGame">Create Game</button>
          <p class="help">You will receive a game code and lobby page to invite players.</p>
        </div>`;
      $("#createGame").onclick=async()=>{ try{ const data=await API.createGame({}); storage.set("active_room", data, true); location.hash="#/game/"+data.game_code; }catch(e){ toast(e.message||"Failed to create"); } };
    }
  };

  pages.join=()=>{
    render(`
      <section class="container" style="max-width:520px;">
        <div class="card">
          <h2>Join a game</h2>
          <div class="grid">
            <input id="gameId" class="input" placeholder="Game code"/>
            <input id="nickname" class="input" placeholder="Nickname (optional)"/>
            <button id="joinBtn" class="btn" style="margin-top:8px;">Join</button>
          </div>
        </div>
      </section>
    `);
    $("#joinBtn").onclick=async()=>{
      const game_code=$("#gameId").value.trim(); const nickname=$("#nickname").value.trim()||undefined;
      if (!game_code) return toast("Enter game code");
      try{ const data=await API.joinGuest({ game_code, nickname }); storage.set("active_room",{ game_code }, true); storage.set("player_id", data.player_id, true); location.hash="#/game/"+game_code; }
      catch(e){ toast(e.message||"Failed to join"); }
    };
  };

  pages.login=()=>{
    render(`
      <section class="container" style="max-width:520px;">
        <div class="card">
          <h2>Login</h2>
          <div class="grid">
            <input id="email" class="input" placeholder="Email" type="email"/>
            <input id="password" class="input" placeholder="Password" type="password"/>
            <label><input id="remember" type="checkbox"/> Remember me</label>
            <button id="loginBtn" class="btn">Login</button>
            <div style="display:flex; gap:10px; justify-content:space-between;">
              <a class="help" href="#/register">Create account</a>
              <a class="help" href="#/forgot">Forgot password?</a>
            </div>
          </div>
        </div>
      </section>
    `);
    $("#loginBtn").onclick=async()=>{
      try{
        const sb=await ensureSupabase();
        const email=$("#email").value.trim(); const password=$("#password").value;
        const remember=$("#remember").checked;
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        storage.set("remember_me", !!remember, !!remember);
        toast("Welcome back"); location.hash="#/";
      }catch(e){ toast(e.message||"Login failed"); }
    };
  };

  pages.register=()=>{
    render(`
      <section class="container" style="max-width:640px;">
        <div class="card">
          <h2>Create account</h2>
          <div class="grid grid-2">
            <input id="name" class="input" placeholder="Full name"/>
            <input id="dob" class="input" type="date" placeholder="Date of birth"/>
            <select id="gender" class="select"><option value="">Gender</option><option>Female</option><option>Male</option><option>Other</option></select>
            <input id="email" class="input" placeholder="Email" type="email"/>
            <input id="password" class="input" placeholder="Password" type="password"/>
            <label style="grid-column:1/-1;"><input id="consent" type="checkbox"/> I agree to the <a href="#/terms">Terms</a> and <a href="#/privacy">Privacy Policy</a></label>
            <button id="registerBtn" class="btn" style="grid-column:1/-1;">Create account</button>
            <div><a class="help" href="#/login">Already have an account? Login</a></div>
          </div>
        </div>
      </section>
    `);
    $("#registerBtn").onclick=async()=>{
      if (!$("#consent").checked) return toast("Please accept Terms and Privacy");
      try{
        const sb=await ensureSupabase();
        const payload={ name:$("#name").value.trim(), dob:$("#dob").value, gender:$("#gender").value, email:$("#email").value.trim(), password:$("#password").value };
        const { error } = await sb.auth.signUp({ email:payload.email, password:payload.password, options:{ data:{ name:payload.name, dob:payload.dob, gender:payload.gender }}});
        if (error) throw error;
        toast("Check your email to verify"); location.hash="#/login";
      }catch(e){ toast(e.message||"Registration failed"); }
    };
  };

  pages.forgot=()=>{
    render(`
      <section class="container" style="max-width:520px;">
        <div class="card"><h2>Forgot password</h2>
          <input id="email" class="input" placeholder="Email" type="email"/>
          <button id="forgotBtn" class="btn" style="margin-top:8px;">Send reset link</button>
        </div>
      </section>
    `);
    $("#forgotBtn").onclick=async()=>{
      try{
        const sb=await ensureSupabase();
        const { error } = await sb.auth.resetPasswordForEmail($("#email").value.trim(), { redirectTo: location.origin + "/#/reset" });
        if (error) throw error;
        toast("Reset email sent");
      }catch(e){ toast(e.message||"Failed to send"); }
    };
  };

  pages.reset=()=>{
    render(`
      <section class="container" style="max-width:520px;">
        <div class="card"><h2>Reset password</h2>
          <input id="password" class="input" placeholder="New password" type="password"/>
          <button id="resetBtn" class="btn" style="margin-top:8px;">Update password</button>
        </div>
      </section>
    `);
    $("#resetBtn").onclick=async()=>{
      try{
        const sb=await ensureSupabase();
        const { error } = await sb.auth.updateUser({ password: $("#password").value });
        if (error) throw error;
        toast("Password updated"); location.hash="#/login";
      }catch(e){ toast(e.message||"Failed to update"); }
    };
  };

  pages.account=()=>{
    render(`
      <section class="container" style="max-width:720px;">
        <div class="card"><h2>Account</h2>
          <div class="grid grid-2">
            <input id="name" class="input" placeholder="Name"/>
            <input id="dob" class="input" type="date" placeholder="Date of birth"/>
            <select id="gender" class="select"><option value="">Gender</option><option>Female</option><option>Male</option><option>Other</option></select>
            <button id="saveProfile" class="btn">Save</button>
            <button id="sendReport" class="btn secondary">Send latest report to my email</button>
          </div>
        </div>
      </section>
    `);
    $("#sendReport").onclick=()=>toast("Email requested. Check your inbox");
  };

  pages.billing=()=>{
    render(`
      <section class="container" style="max-width:720px;">
        <div class="card"><h2>Billing</h2>
          <div class="grid">
            <button class="btn" id="extend">Extend game by 60 min</button>
            <button class="btn secondary" id="extra">Buy extra weekly game</button>
            <button class="btn ghost" id="sub">Subscribe</button>
          </div>
        </div>
      </section>
    `);
    $("#extend").onclick=()=>{ storage.set("sim_extend_success", true, true); toast("Simulated: extended"); };
    $("#extra").onclick=()=>toast("Simulated: extra weekly game purchased");
    $("#sub").onclick=()=>toast("Simulated: subscription active");
  };

  // ===== Game Room (single route, 3 states) =====
  pages.game=(code)=>{ render(`<section class="container"><div id="gameRoot"></div></section>`); Game.mount(code); };

  const Game={
    code:null, poller:null,
    state:{ phase:"lobby", ends_at:null, players:[], active_player_id:null, question:null },
    async mount(code){
      this.code=code;
      $("#gameRoot").innerHTML = `<div class="card"><h2>Game ${code}</h2><div id="gameCard"></div></div>`;
      this.render(); await this.refresh(); this.start();
    },
    start(){ if(this.poller) clearInterval(this.poller); this.poller=setInterval(()=>this.refresh(), 3000); },
    isActive(){ const me=storage.get("player_id"); return me && me===this.state.active_player_id; },
    async refresh(){
      try{ const data=await API.getState({ game_code:this.code }); this.state=Object.assign({},this.state,data); this.render(); }
      catch(e){ debug({ refresh_error:e.message }); }
    },
    countdown(iso){ if(!iso) return "--:--"; const end=new Date(iso).getTime(); const diff=Math.max(0,Math.floor((end-Date.now())/1000)); const m=String(Math.floor(diff/60)).padStart(2,"0"); const s=String(diff%60).padStart(2,"0"); return `${m}:${s}`; },
    render(){
      const s=this.state, root=$("#gameCard");
      if (s.phase==="lobby") return this.renderLobby(root);
      if (s.phase==="running") return this.renderRunning(root);
      if (s.phase==="ended") return this.renderSummary(root);
      this.renderLobby(root);
    },
    renderLobby(root){
      const players=(this.state.players||[]).map(p=>`<li>${p.name||p.nickname||"Player"}</li>`).join("");
      root.innerHTML = `
        <div class="grid">
          <div>Share this code: <strong>${this.code}</strong></div>
          <div style="display:flex;gap:10px;">
            <button class="btn" id="copyInvite">Copy invite</button>
            <button class="btn secondary" id="startGame">Start</button>
          </div>
          <div class="card"><strong>Players</strong><ul>${players || "<li>No players yet</li>"}</ul></div>
        </div>`;
      $("#copyInvite").onclick=()=>{ navigator.clipboard.writeText(location.origin + "/#/game/" + this.code); toast("Link copied"); };
      $("#startGame").onclick=async()=>{ try{ await API.startGame({ game_code:this.code }); await this.refresh(); }catch(e){ toast(e.message||"Start failed"); } };
    },
    renderRunning(root){
      const remaining=this.countdown(this.state.ends_at);
      const [mm,ss]=(remaining||"0:0").split(":").map(x=>parseInt(x)||0);
      const canExtend = (mm*60+ss) <= 600;
      root.innerHTML = `
        <div class="grid">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div>
              <span class="badge-dot simple"></span>
              <span class="badge-dot medium"></span>
              <span class="badge-dot deep"></span>
            </div>
            <div class="timer">⏱ ${remaining}</div>
          </div>
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">${this.state.question?.title || "Question"}</h3>
              <button class="btn ghost" id="clarifyBtn">?</button>
            </div>
            <p class="help">${this.state.question?.text || ""}</p>
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button id="micBtn" class="btn secondary" ${this.isActive()?"":"disabled"}>Mic</button>
              <input id="answer" class="input" placeholder="Type your answer..." ${this.isActive()?"":"disabled"} />
              <button id="submitBtn" class="btn" ${this.isActive()?"":"disabled"}>Submit</button>
            </div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button id="nextCard" class="btn">Reveal next card</button>
            <a class="btn ghost" href="#/billing" ${canExtend?"":"aria-disabled='true'"}>Extend</a>
            <button id="endAnalyze" class="btn" style="background:#e11d48;">End and analyze</button>
          </div>
        </div>
        <dialog id="clarifyModal" style="padding:0;border:0;border-radius:12px;max-width:560px;">
          <div class="card"><h3 style="margin:0 0 8px 0;">Clarification</h3><p class="help">Short explanation.</p><div style="text-align:right"><button class="btn ghost" id="closeClarify">Close</button></div></div>
        </dialog>`;
      $("#clarifyBtn").onclick=()=>$("#clarifyModal").showModal();
      $("#closeClarify").onclick=()=>$("#clarifyModal").close();
      $("#submitBtn")?.addEventListener("click", async()=>{
        if (!this.isActive()) return;
        const text=$("#answer").value.trim(); if (!text) return;
        try{ await API.nextQuestion({ game_code:this.code, answer:text }); $("#answer").value=""; await this.refresh(); }catch(e){ toast(e.message||"Submit failed"); }
      });
      $("#nextCard").onclick=async()=>{ try{ await API.nextQuestion({ game_code:this.code }); await this.refresh(); }catch(e){ toast(e.message||"Next failed"); } };
      $("#endAnalyze").onclick=async()=>{ try{ await API.endAnalyze({ game_code:this.code }); await this.refresh(); }catch(e){ toast(e.message||"End failed"); } };
    },
    renderSummary(root){
      root.innerHTML = `
        <div class="grid">
          <div class="card">
            <h3>Summary</h3>
            <p class="help">A quick view of how the game went. Full report can be emailed.</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button id="emailReport" class="btn">Email me my full report</button>
              <button id="copyShare" class="btn ghost">Share</button>
            </div>
            <p class="help">Note, data is retained for about 30 minutes.</p>
          </div>
        </div>`;
      $("#emailReport").onclick=()=>toast("Report requested. Check your email.");
      $("#copyShare").onclick=()=>{ navigator.clipboard.writeText(location.href); toast("Link copied"); };
    }
  };

  // ===== Routes =====
  route("#/", pages.home);
  route("#/host", pages.host);
  route("#/join", pages.join);
  route("#/login", pages.login);
  route("#/register", pages.register);
  route("#/forgot", pages.forgot);
  route("#/reset", pages.reset);
  route("#/account", pages.account);
  route("#/billing", pages.billing);

  // ===== Boot =====
  (async function(){
    if (!location.hash) location.hash="#/";
    const app=document.getElementById("app");
    app.insertAdjacentHTML("beforeend", `<div class="debug-tray" id="debug-tray"><pre id="debug-pre"></pre></div>`);
    navigate();
  })();

})();