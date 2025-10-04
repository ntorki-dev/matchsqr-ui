(function(){
  // ===== Utilities =====
  const log = (...args)=>{ if (window.__DEBUG__) console.log("[MS]", ...args); };
  const $ = (sel, root=document)=> root.querySelector(sel);
  function toast(msg, ms=2200){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), ms); }
  function debug(obj){ const pre=$("#debug-pre"); if(!pre) return; const s=pre.textContent+"\n"+JSON.stringify(obj,null,2); pre.textContent=s.slice(-30000); }
  function setOfflineBanner(show){ const b=$(".offline-banner"); if(!b) return; b.classList.toggle("show", !!show); }
  window.addEventListener("offline",()=>setOfflineBanner(true));
  window.addEventListener("online",()=>setOfflineBanner(false));

  // ===== Config & Supabase =====
  const CONFIG = window.CONFIG || {};
  const RAW_BASE = CONFIG.FUNCTIONS_BASE || "";
  const FUNCTIONS_BASE = (RAW_BASE || "").replace(/\/+$/,"");
  let supabase = null;
  let __supabaseAnonKey = CONFIG.SUPABASE_ANON_KEY || CONFIG.FALLBACK_SUPABASE_ANON_KEY || "";

  async function ensureSupabase(){
    if (supabase) return supabase;
    const g=(typeof globalThis!=="undefined"?globalThis:window);
    if (!g.supabase) throw new Error("Supabase UMD not loaded");
    let url = CONFIG.SUPABASE_URL || CONFIG.FALLBACK_SUPABASE_URL || g.SUPABASE_URL || g.__SUPABASE_URL || "";
    let key = CONFIG.SUPABASE_ANON_KEY || CONFIG.FALLBACK_SUPABASE_ANON_KEY || g.SUPABASE_KEY || g.__SUPABASE_KEY || "";
    try{
      const res=await fetch(FUNCTIONS_BASE + "/config");
      if (res.ok){ const c=await res.json(); url=c.supabase_url||url; key=c.supabase_anon_key||key; }
    }catch(e){}
    supabase = g.supabase.createClient(url, key);
    __supabaseAnonKey = key || __supabaseAnonKey || "";
    return supabase;
  }
  async function buildAuthHeaders(){
    await ensureSupabase();
    let token=""; try{ const { data } = await supabase.auth.getSession(); token=data?.session?.access_token||""; }catch(e){}
    const authToken = token || __supabaseAnonKey || "";
    const h={"Content-Type":"application/json"}; if (authToken){ h.Authorization="Bearer "+authToken; h.apikey=__supabaseAnonKey||authToken; } return h;
  }
  function joinPath(base, path){ return (base||"").replace(/\/+$/,"") + "/" + (path||"").replace(/^\/+/,""); }

  // ===== API (with normalization) =====
  async function edge(path, { method="POST", body }={}){
    const url = joinPath(FUNCTIONS_BASE, path);
    const headers = await buildAuthHeaders();
    debug({ edge:{ url, method, body } });
    const res = await fetch(url, { method, headers, body: body?JSON.stringify(body):undefined });
    const text = await res.text();
    let data=null; try{ data=JSON.parse(text); }catch{}
    debug({ edge_result:{ status:res.status, data, text:data?undefined:text } });
    if (!res.ok){ const err=new Error((data&&data.message)||text||"Request failed"); err.status=res.status; err.data=data; throw err; }
    return data || {};
  }
  function normState(server){
    if (!server || typeof server!=="object") return null;
    const phase = server.status || server.phase || null;
    const players = Array.isArray(server.participants)
      ? server.participants.map(p=>({ id:p.id, name:p.name, role:p.role, seat_index:p.seat_index }))
      : (server.players || []);
    const active_player_id = (server.current_turn && (server.current_turn.player_id || server.current_turn.id)) || server.active_player_id || null;
    const question = server.question ?? null;
    const ends_at = server.ends_at ?? null;
    return { phase, players, active_player_id, question, ends_at };
  }
  const API = {
    createGame: (opts)=> edge("/create_game",{ body:opts||{} }),
    joinGuest: (p)=>{ const code=p.game_code||p.code; return edge("/join_game_guest",{ body:{...p, game_code:code, code} }); },
    startGame: (p)=>{ const code=p.game_code||p.code; return edge("/start_game",{ body:{...p, game_code:code, code} }); },
    nextQuestion: (p)=>{ const code=p.game_code||p.code; return edge("/next_question",{ body:{...p, game_code:code, code} }); },
    endAnalyze: (p)=>{ const code=p.game_code||p.code; return edge("/end_game_and_analyze",{ body:{...p, game_code:code, code} }); },
    entitlementCheck: (p)=>{ const code=p.game_code||p.code; return edge("/entitlement_check",{ body:{...p, game_code:code, code} }); },
    getState: async (p)=>{
      const code = p.game_code||p.code||"";
      let url = joinPath(FUNCTIONS_BASE, "/get_state") + "?code=" + encodeURIComponent(code);
      let headers = await buildAuthHeaders();
      debug({ edge:{ url, method:"GET" } });
      let res = await fetch(url, { headers });
      if (!res.ok){ url = joinPath(FUNCTIONS_BASE, "/get_state") + "?game_code=" + encodeURIComponent(code); debug({ edge_retry:{ url, method:"GET" } }); res = await fetch(url, { headers }); }
      const data = await res.json();
      debug({ edge_result:{ status:res.status, data } });
      if (!res.ok){ const err=new Error((data&&data.message)||"get_state failed"); err.status=res.status; err.data=data; throw err; }
      return normState(data);
    }
  };

  // ===== Storage =====
  const storage = { set(k,v,remember=false){ (remember?localStorage:sessionStorage).setItem(k, JSON.stringify(v)); },
    get(k){ try{ const v=localStorage.getItem(k)??sessionStorage.getItem(k); return v?JSON.parse(v):null; }catch{ return null; } },
    del(k){ localStorage.removeItem(k); sessionStorage.removeItem(k); } };

  // ===== Router & Layout =====
  const routes={}; function route(p,h){ routes[p]=h; }
  function parseHash(){ const h=location.hash||"#/"; const [p,q]=h.split("?"); return { path:p, query:Object.fromEntries(new URLSearchParams(q)) }; }
  async function navigate(){ const {path}=parseHash(); const gm = path.match(/^#\/game\/(.+)$/); if (routes[path]) return routes[path](); if (gm) return pages.game(gm[1]); return pages.home(); }
  window.addEventListener("hashchange", navigate);

  function navHome(){ return `<div class="nav home">
      <a class="brand" href="#/"><img src="./assets/logo.png" alt="logo"/><span>MatchSqr</span></a>
      <div class="right"><a class="btn-login" href="#/login">Login</a><a class="btn-help" href="#/help">?</a></div>
    </div>`; }
  function navApp(){ return `<div class="nav app container">
      <a class="brand" href="#/"><img src="./assets/logo.png" alt="logo"/><span>MatchSqr</span></a>
      <div class="right"><a class="btn ghost" href="#/host">Host</a><a class="btn ghost" href="#/join">Join</a></div>
    </div>`; }
  function render(content, variant="app"){
    const app=document.getElementById("app");
    app.innerHTML = `<div class="offline-banner">You are offline. Trying to reconnect…</div>
      ${variant==="home"? navHome(): navApp()}
      ${content}
      <div class="debug-tray" id="debug-tray"><pre id="debug-pre"></pre></div>`;
    if (parseHash().query.debug==="1") $("#debug-tray").style.display="block";
    setOfflineBanner(!navigator.onLine);
  }

  // ===== Pages =====
  const pages={};
  pages.home=()=>{ render(`<section class="hero">
        <img class="globe" src="./assets/globe.png" alt="globe"/>
        <h1>Safe space to build meaningful connections.</h1>
        <p>Play with other people interactive games designed to uncover shared values, emotional style, interests, and personality.</p>
        <div class="cta-row">
          <a class="cta" href="#/host"><img src="./assets/crown.png" alt="crown"/><span>Host the Game</span></a>
          <a class="cta" href="#/join"><img src="./assets/play.png" alt="play"/><span>Join the Game</span></a>
        </div>
      </section>
      <a class="learn-more" href="#/terms">Learn more about MatchSqr</a>`, "home"); };

  pages.host=()=>{
    render(`<section class="container"><div class="card"><h2>Host a game</h2><div id="hostControls"></div></div></section>`);
    const state=storage.get("active_room"); const el=$("#hostControls");
    if (state && state.game_code){
      el.innerHTML = `<div class="grid">
          <div>Active room: <strong>${state.game_code}</strong></div>
          <div style="display:flex; gap:10px;">
            <button class="btn" id="goRoom">Go to room</button>
            <button class="btn ghost" id="copyLink">Copy invite</button>
          </div>
        </div>`;
      $("#goRoom").onclick=()=>location.hash="#/game/"+state.game_code; // NO is_host side effects
      $("#copyLink").onclick=()=>{ navigator.clipboard.writeText(location.origin + "/#/game/" + state.game_code); toast("Link copied"); };
    }else{
      el.innerHTML = `<div class="grid">
          <button class="btn" id="createGame">Create Game</button>
          <p class="help">You will receive a game code and lobby page to invite players.</p>
        </div>`;
      $("#createGame").onclick=async()=>{
        try{
          const data=await API.createGame({});
          storage.set("active_room", data, true);
          location.hash="#/game/"+data.game_code;
        }catch(e){
          if (e && e.status===409 && e.data?.error==="host_has_active_game" && e.data.code){
            storage.set("active_room", { game_code: e.data.code }, true);
            location.hash="#/game/"+e.data.code;
            toast("You have an active game. Opening existing room.");
            return;
          }
          toast(e.message||"Failed to create");
        }
      };
    }
  };

  pages.join=()=>{
    render(`<section class="container" style="max-width:520px;"><div class="card">
          <h2>Join a game</h2>
          <div class="grid">
            <input id="gameId" class="input" placeholder="Game code"/>
            <input id="nickname" class="input" placeholder="Nickname (optional)"/>
            <button id="joinBtn" class="btn" style="margin-top:8px;">Join</button>
          </div>
        </div></section>`);
    $("#joinBtn").onclick=async()=>{
      const code=$("#gameId").value.trim(); const nickname=$("#nickname").value.trim()||undefined;
      if (!code) return toast("Enter game code");
      try{ const data=await API.joinGuest({ game_code:code, nickname }); storage.set("active_room",{ game_code:code }, true); storage.set("player_id", data.player_id, true); location.hash="#/game/"+code; }
      catch(e){ toast(e.message||"Failed to join"); }
    };
  };

  // ===== Game Room =====
  pages.game=(code)=>{ render(`<section class="container"><div id="gameRoot"></div></section>`); Game.mount(code); };

  const Game={
    code:null, poller:null, role:null,
    state:{ phase:null, players:[], active_player_id:null, question:null, ends_at:null },
    async mount(code){
      this.code=code;
      $("#gameRoot").innerHTML = `<div class="card"><h2>Game ${code}</h2><div id="gameCard"></div></div>`;
      this.render(); // loading
      await this.refresh(); // pulls phase
      await this.checkRole(); // sets role to host/guest if backend supports it
      this.start();
    },
    async checkRole(){
      try{ const r = await API.entitlementCheck({ game_code:this.code }); 
        // Accept common shapes: {role:'host'} or {is_host:true} or {me:{role:'host'}}
        this.role = (r && (r.role || (r.is_host? 'host': null) || (r.me && r.me.role))) || this.role;
        debug({ entitlement:this.role });
        this.render();
      }catch(e){ /* On failure, leave role null; server will still enforce on Start. */ }
    },
    start(){ if(this.poller) clearInterval(this.poller); this.poller=setInterval(()=>this.refresh(), 3000); },
    isActive(){ const me=storage.get("player_id"); return me && me===this.state.active_player_id; },
    async refresh(){
      try{ const data=await API.getState({ game_code:this.code }); if (data) this.state={ ...this.state, ...data }; this.render(); }
      catch(e){ debug({ refresh_error:e.message }); }
    },
    countdown(iso){ if(!iso) return "--:--"; const end=new Date(iso).getTime(); const diff=Math.max(0,Math.floor((end-Date.now())/1000)); const m=String(Math.floor(diff/60)).padStart(2,"0"); const s=String(diff%60).padStart(2,"0"); return `${m}:${s}`; },
    render(){
      const root=$("#gameCard"); const s=this.state;
      if (!s.phase){ root.innerHTML = `<p class="help">Loading room…</p>`; return; }
      if (s.phase==="lobby") return this.renderLobby(root);
      if (s.phase==="running") return this.renderRunning(root);
      if (s.phase==="ended") return this.renderSummary(root);
      root.innerHTML = `<p class="help">Loading…</p>`;
    },
    renderLobby(root){
      const players=(this.state.players||[]).map(p=>`<li>${p.name || "Player"}</li>`).join("");
      const canStart = (this.role === 'host');
      root.innerHTML = `<div class="grid">
          <div>Share this code: <strong>${this.code}</strong></div>
          ${canStart ? `<div style="margin:8px 0;"><button class="btn" id="startGame">Start</button></div>` : ``}
          <div class="card"><strong>Players</strong><ul>${players || "<li>No players yet</li>"}</ul></div>
        </div>`;
      if (canStart){
        $("#startGame").onclick=async()=>{
          try{ await API.startGame({ game_code:this.code }); await this.refresh(); }
          catch(e){ toast(e.message||"Start failed"); }
        };
      }
    },
    renderRunning(root){
      const remaining=this.countdown(this.state.ends_at);
      const [mm,ss]=(remaining||"0:0").split(":").map(x=>parseInt(x)||0);
      const canExtend = (mm*60+ss) <= 600;
      root.innerHTML = `<div class="grid">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div><span class="badge-dot simple"></span><span class="badge-dot medium"></span><span class="badge-dot deep"></span></div>
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
      root.innerHTML = `<div class="grid"><div class="card">
            <h3>Summary</h3>
            <p class="help">A quick view of how the game went. Full report can be emailed.</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button id="emailReport" class="btn">Email me my full report</button>
              <button id="copyShare" class="btn ghost">Share</button>
            </div>
            <p class="help">Note, data is retained for about 30 minutes.</p>
          </div></div>`;
      $("#emailReport").onclick=()=>toast("Report requested. Check your email.");
      $("#copyShare").onclick=()=>{ navigator.clipboard.writeText(location.href); toast("Link copied"); };
    }
  };

  // ===== Routes =====
  route("#/", pages.home);
  route("#/host", pages.host);
  route("#/join", pages.join);
  route("#/login", pages.login);
  route("#/billing", function(){ render(`<section class="container"><div class="card"><h2>Billing</h2><p class="help">Simulated purchases only.</p></div></section>`); });

  // ===== Boot =====
  (async function(){
    if (!location.hash) location.hash="#/";
    const app=document.getElementById("app");
    if (app && !document.getElementById("debug-tray")){
      app.insertAdjacentHTML("beforeend", `<div class="debug-tray" id="debug-tray"><pre id="debug-pre"></pre></div>`);
    }
    try{ await ensureSupabase(); }catch(e){}
    const { path } = (function(){ const h=location.hash||"#/"; const [p]=h.split("?"); return { path:p }; })();
    if (path==="#/host") pages.host();
    else if (path==="#/join") pages.join();
    else if (path==="#/login") pages.login();
    else if (path.startsWith("#/game/")) { const code=path.split("/")[2]; pages.game(code); }
    else pages.home();
    window.addEventListener("hashchange", navigate);
  })();

})();
