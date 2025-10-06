
/*! MatchSqr New UI — singleton Supabase client: reuse if present, else create via /config -> config.js */
(function(){
  const $ = (sel, root=document) => root.querySelector(sel);
  function toast(msg, ms=2200){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), ms); }
  function debug(obj){ const pre=$("#debug-pre"); if(!pre) return; const s=pre.textContent + "\n" + JSON.stringify(obj,null,2); pre.textContent=s.slice(-30000); }
  function setOfflineBanner(show){ const b=$(".offline-banner"); if(!b) return; b.classList.toggle("show", !!show); }
  addEventListener("offline",()=>setOfflineBanner(true));
  addEventListener("online",()=>setOfflineBanner(false));

  const CONFIG = window.CONFIG || {};
  const FUNCTIONS_BASE = (CONFIG.FUNCTIONS_BASE || "").replace(/\/+$/,"");

  // ---------- Supabase client (singleton: reuse else create once) ----------
  async function ensureClient(){
    // reuse first
    if (window.__MS_CLIENT && window.__MS_CLIENT.auth && window.__MS_CLIENT.functions) return window.__MS_CLIENT;
    if (window.supabaseClient && window.supabaseClient.auth && window.supabaseClient.functions) { window.__MS_CLIENT = window.supabaseClient; return window.__MS_CLIENT; }
    if (window.supabase && window.supabase.auth && window.supabase.functions && window.supabase.from){ 
      // This is *already a client instance* exposed globally (rare), reuse.
      window.__MS_CLIENT = window.supabase; return window.__MS_CLIENT;
    }
    // create once
    if (!window.supabase || !window.supabase.createClient){
      throw new Error("[MS] Supabase UMD not loaded before app.js");
    }
    let url="", key="";
    try{
      const res = await fetch(FUNCTIONS_BASE + "/config");
      if (res.ok){
        const json = await res.json();
        url = json.supabase_url || url;
        key = json.supabase_anon_key || key;
      }
    }catch(_){/* ignore */}
    url = url || CONFIG.SUPABASE_URL || CONFIG.FALLBACK_SUPABASE_URL || "";
    key = key || CONFIG.SUPABASE_ANON_KEY || CONFIG.FALLBACK_SUPABASE_ANON_KEY || "";
    if (!url || !key) throw new Error("[MS] Missing Supabase URL/Key. Ensure /config or config.js provides them.");
    const client = window.supabase.createClient(url, key, { auth: { storageKey: "ms-auth" } });
    window.__MS_CLIENT = client;
    window.supabaseClient = client; // expose for any legacy code
    return client;
  }
  async function getSession(){ const sb=await ensureClient(); const { data } = await sb.auth.getSession(); return (data&&data.session)||null; }
  function authHeader(session){ const token=session?.access_token||""; return token?{Authorization:`Bearer ${token}`}:{ }; }

  // ---------- storage & code resolution ----------
  function storedRoom(){
    try{ return JSON.parse(localStorage.getItem("active_room") || sessionStorage.getItem("active_room") || "null") || {}; }catch{return {}}
  }
  function saveActiveRoom(obj){
    const code = obj?.game_code || obj?.code || obj?.id || obj?.room_id || obj?.roomId;
    const toSave = { ...(storedRoom()||{}), ...obj, game_code: code, code };
    localStorage.setItem("active_room", JSON.stringify(toSave));
  }
  function resolveCode(explicit){
    if (explicit) return explicit;
    const m = (location.hash||"").match(/^#\/game\/([^?]+)/);
    if (m) return m[1];
    const ar = storedRoom();
    return ar.game_code || ar.code || ar.id || ar.room_id || ar.roomId || ar.game_id || ar.gameId || null;
  }
  const pidKey = (code)=>`ms_pid_${code}`;

  // ---------- HTTP helpers (Edge Functions) ----------
  async function jpost(path, body){
    const session = await getSession();
    const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
      method:"POST",
      headers:{ "Content-Type":"application/json", ...authHeader(session) },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json=null; try{ json=text?JSON.parse(text):null; }catch{}
    if(!res.ok){ const e=new Error((json&&(json.message||json.error))||text||"Request failed"); e.status=res.status; e.data=json; throw e; }
    return json;
  }
  async function jget(pathWithQuery){
    const session = await getSession();
    const res = await fetch(`${FUNCTIONS_BASE}/${pathWithQuery}`, { headers: { ...authHeader(session) } });
    const text=await res.text();
    let json=null; try{ json=text?JSON.parse(text):null; }catch{}
    if(!res.ok){ const e=new Error((json&&(json.message||json.error))||text||"Request failed"); e.status=res.status; e.data=json; throw e; }
    return json;
  }

  // ---------- API (exact contracts) ----------
  const API = {
    create_game(){ return jpost("create_game", null); },
    get_state(p){ const code=resolveCode(p?.code); if(!code) throw new Error("Missing game id"); return jget(`get_state?code=${encodeURIComponent(code)}`); },
    join_game_guest(p){
      const code=resolveCode(p?.code); if(!code) throw new Error("Missing game id");
      const nickname = p?.nickname || p?.name || "";
      const existingPid = localStorage.getItem(pidKey(code));
      const body = { code };
      if (existingPid) body.participant_id = JSON.parse(existingPid);
      if (nickname) body.nickname = nickname;
      return jpost("join_game_guest", body).then(data=>{
        const pid = data?.participant_id || data?.player_id || null;
        if (pid){ localStorage.setItem(pidKey(code), JSON.stringify(pid)); localStorage.setItem("player_id", JSON.stringify(pid)); }
        const roomId = data?.room_id || data?.id || code;
        saveActiveRoom({ ...data, id: roomId, code });
        return data;
      });
    },
    start_game(p){ const code=resolveCode(p?.gameId||p?.code); if(!code) throw new Error("Missing game id"); return jpost("start_game", { gameId: code }); },
    next_question(p){ const code=resolveCode(p?.gameId||p?.code); if(!code) throw new Error("Missing game id"); return jpost("next_question", { gameId: code }).catch(e=>{ if(e.status===400||e.status===422) throw e; return jpost("next_question", null); }); },
    end_game_and_analyze(p){ const code=resolveCode(p?.gameId||p?.code); if(!code) throw new Error("Missing game id"); return jpost("end_game_and_analyze", { gameId: code }); },
    heartbeat(p){ const code=resolveCode(p?.gameId||p?.code); if(!code) throw new Error("Missing game id"); return jpost("heartbeat", { gameId: code }); },
    participant_heartbeat(p){ const code=resolveCode(p?.gameId||p?.code); if(!code) throw new Error("Missing game id"); const pid=JSON.parse(localStorage.getItem(pidKey(code))||"null"); return jpost("participant_heartbeat", { gameId: code, participant_id: pid }); },
    submit_answer(p){ const code=resolveCode(p?.gameId||p?.code); if(!code) throw new Error("Missing game id"); const pid=JSON.parse(localStorage.getItem(pidKey(code))||"null"); return jpost("submit_answer", { game_id: code, question_id: p?.question_id||p?.qid||null, text: p?.text||p?.answer||"", temp_player_id: pid, participant_id: pid, name: p?.name||p?.nickname||undefined }); }
  };

  // ---------- Header ----------
  async function renderHeader(){
    const app=document.getElementById("app");
    const headerHTML = `
      <div class="header">
        <a class="brand" href="#/"><img src="./assets/logo.png" alt="logo"/><span>MatchSqr</span></a>
        <div class="right" id="hdrRight">
          <a class="btn-login" href="#/login">Login</a>
          <a class="btn-help" href="#/help">?</a>
        </div>
      </div>`;
    app.innerHTML = headerHTML + app.innerHTML;

    try{
      const session = await getSession();
      const user = session?.user || null;
      if (user){
        const name = user.user_metadata?.name || (user.email? user.email.split("@")[0] : "Account");
        const right = $("#hdrRight");
        if (right){
          right.innerHTML = `
            <a class="avatar-link" href="#/account" title="${name}"><img class="avatar" src="./assets/profile.png" alt="profile"/></a>
            <a class="btn-help" href="#/help">?</a>`;
        }
      }
    }catch{}
  }
  function ensureDebugTray(){
    const app = document.getElementById("app");
    if (!document.getElementById("debug-tray")){
      app.insertAdjacentHTML("beforeend", `<div class="debug-tray" id="debug-tray"><pre id="debug-pre"></pre></div>`);
    }
    setOfflineBanner(!navigator.onLine);
  }

  // ---------- Router ----------
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

  // ---------- Pages ----------
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
        const sb = await ensureClient();
        const { error } = await sb.auth.signInWithPassword({ email:$("#email").value.trim(), password:$("#password").value });
        if (error) throw error;
        const remember = !!$("#remember").checked;
        (remember?localStorage:sessionStorage).setItem("remember_me", JSON.stringify(remember));
        location.hash = redirectTo;
        sessionStorage.removeItem("__redirect_after_login");
      }catch(e){ toast(e.message||"Login failed"); }
    };
  };

  pages.account=async()=>{
    const app=document.getElementById("app");
    const session = await getSession();
    const user=session?.user||null;
    const name = user?.user_metadata?.name || (user?.email? user.email.split("@")[0] : "Account");
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
    $("#logoutBtn").onclick=async()=>{ const sb=await ensureClient(); await sb.auth.signOut(); location.hash="#/"; };
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
          const data = await API.create_game();
          const code = data?.game_code || data?.code || data?.id || data?.room_id || data?.roomId;
          if (!code){ debug({ create_game_unexpected_response:data }); toast("Created, but no code returned"); return; }
          saveActiveRoom({ ...data, code });
          location.hash="#/host";
        }catch(e){
          if (e.status===409 && e.data){
            const code = e.data.game_code || e.data.code || e.data.id || e.data.room_id || e.data.roomId;
            if (code){
              saveActiveRoom({ ...e.data, code });
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
      try{ await API.join_game_guest({ code, nickname }); location.hash="#/game/"+code; }
      catch(e){ toast(e.message||"Failed to join"); debug({ join_error:e }); }
    };
  };

  // ---------- Game Room ----------
  const Game={
    code:null, poll:null, tick:null, hbH:null, hbG:null,
    state:{ phase:"lobby", ends_at:null, players:[], active_player_id:null, question:null, host_user_id:null, min_players_required:2 },
    async mount(code){
      this.code=code;
      await this.refresh();
      this.startPolling();
      this.startHeartbeats();
      this.startTick();
    },
    startPolling(){ if(this.poll) clearInterval(this.poll); this.poll=setInterval(()=>this.refresh(), 3000); },
    startTick(){ if(this.tick) clearInterval(this.tick); this.tick=setInterval(()=>this.renderTimer(), 1000); },
    async startHeartbeats(){
      const session = await getSession();
      const user = session?.user || null;
      const isHost = (user?.id && user.id === this.state.host_user_id);
      if (isHost){
        if (this.hbH) clearInterval(this.hbH);
        this.hbH = setInterval(()=>API.heartbeat({ gameId:this.code }).catch(()=>{}), 10000);
      }else{
        if (this.hbG) clearInterval(this.hbG);
        this.hbG = setInterval(()=>API.participant_heartbeat({ gameId:this.code }).catch(()=>{}), 10000);
      }
    },
    stop(){ if(this.poll) clearInterval(this.poll); if(this.tick) clearInterval(this.tick); if(this.hbH) clearInterval(this.hbH); if(this.hbG) clearInterval(this.hbG); },
    async refresh(){ try{ const data=await API.get_state({ code:this.code }); this.state=Object.assign({}, this.state, data); this.render(); }catch(e){ debug({ refresh_error:e.message }); } },
    isActivePlayer(){ try{ const me=JSON.parse(localStorage.getItem("player_id")||sessionStorage.getItem("player_id")||"null"); return me && me===this.state.active_player_id; }catch{return false;} },
    remainingSeconds(){ if (!this.state.ends_at) return null; const diff=Math.floor((new Date(this.state.ends_at).getTime()-Date.now())/1000); return Math.max(0,diff); },
    renderTimer(){
      const t=this.remainingSeconds(), el=document.getElementById("roomTimer"); if(!el) return;
      if (t==null) { el.textContent="--:--"; return; }
      const m=String(Math.floor(t/60)).padStart(2,"0"), s=String(t%60).padStart(2,"0");
      el.textContent=`${m}:${s}`;
      const extendBtn=$("#extendBtn"); if (extendBtn){ extendBtn.toggleAttribute("disabled", !(t<=600)); }
    },
    async render(){
      const s=this.state; const main=$("#mainCard"); const controls=$("#controlsRow");
      main.innerHTML=""; controls.innerHTML="";
      const session = await getSession(); const user=session?.user||null;
      const isHost = !!(user?.id && s.host_user_id && user.id===s.host_user_id);
      const minPlayers = s.min_players_required || 2;
      const enoughPlayers = Array.isArray(s.players) ? s.players.length >= minPlayers : false;

      if (s.phase==="lobby"){
        const wrap=document.createElement("div"); wrap.style.cssText="display:flex;flex-direction:column;align-items:center;gap:8px;";
        const startBtn=document.createElement("button"); startBtn.className="start-round"; startBtn.id="startGame"; startBtn.textContent="Start";
        startBtn.disabled = !(isHost && enoughPlayers);
        startBtn.onclick=async()=>{
          if(!isHost) return toast("Only host can start");
          if(!enoughPlayers) return toast(`Need at least ${minPlayers} players`);
          try{ await API.start_game({ gameId:this.code }); await this.refresh(); }catch(e){ toast(e.message||"Start failed"); debug({ start_error:e }); }
        };
        const help=document.createElement("div"); help.className="help";
        help.textContent = !isHost ? "Waiting for the host…" : (!enoughPlayers ? `Need at least ${minPlayers} players to start.` : "Ready to start.");
        wrap.appendChild(startBtn); wrap.appendChild(help); main.appendChild(wrap);
        return;
      }

      if (s.phase==="running"){
        const hdr=document.createElement("div"); hdr.style.cssText="position:absolute; top:16px; right:16px; font-weight:800;";
        hdr.innerHTML=`⏱ <span id="roomTimer">--:--</span>`; main.appendChild(hdr);

        const q=document.createElement("div"); q.style.cssText="text-align:center; max-width:640px; padding:8px";
        q.innerHTML = `<h3 style="margin:0 0 8px 0;">${s.question?.title || "Question"}</h3><p class="help" style="margin:0;">${s.question?.text || ""}</p>`;
        main.appendChild(q);

        const km=document.createElement("div"); km.className="kb-mic-row";
        km.innerHTML=`
          <button id="micBtn" class="kb-mic-btn" ${this.isActivePlayer()?"":"disabled"}><img src="./assets/mic.png" alt="mic"/> <span>Mic</span></button>
          <button id="kbBtn" class="kb-mic-btn" ${this.isActivePlayer()?"":"disabled"}><img src="./assets/keyboard.png" alt="kb"/> <span>Keyboard</span></button>`;
        main.appendChild(km);

        const ans=document.createElement("div"); ans.className="answer-row hidden"; ans.id="answerRow";
        ans.innerHTML = `<input id="answerInput" class="input" placeholder="Type your answer..." ${this.isActivePlayer()?"":"disabled"}>
                         <button id="submitBtn" class="btn" ${this.isActivePlayer()?"":"disabled"}>Submit</button>`;
        main.appendChild(ans);

        $("#micBtn").onclick=()=>$("#answerRow").classList.remove("hidden");
        $("#kbBtn").onclick=()=>$("#answerRow").classList.remove("hidden");
        $("#submitBtn").onclick=async()=>{
          if (!this.isActivePlayer()) return;
          const text=$("#answerInput").value.trim(); if (!text) return;
          try{ await API.submit_answer({ gameId:this.code, text }); $("#answerInput").value=""; await this.refresh(); }catch(e){ toast(e.message||"Submit failed"); debug({ submit_error:e }); }
        };

        controls.innerHTML=`
          <button id="nextCard" class="btn" ${isHost?"":"disabled"}>Reveal next card</button>
          <button id="extendBtn" class="btn secondary" disabled>Extend</button>
          <button id="endAnalyze" class="btn danger" ${isHost?"":"disabled"}>End and analyze</button>`;
        $("#nextCard").onclick=async()=>{ if(!isHost) return; try{ await API.next_question({ gameId:this.code }); await this.refresh(); }catch(e){ toast(e.message||"Next failed"); debug({ next_error:e }); } };
        $("#extendBtn").onclick=()=>{ location.hash="#/billing"; };
        $("#endAnalyze").onclick=async()=>{ if(!isHost) return; try{ await API.end_game_and_analyze({ gameId:this.code }); await this.refresh(); }catch(e){ toast(e.message||"End failed"); debug({ end_error:e }); } };
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

  pages.game=async(code)=>{
    const app=document.getElementById("app");
    app.innerHTML=`
      <div class="offline-banner">You are offline. Trying to reconnect…</div>
      <div class="room-wrap">
        <div class="card main-card" id="mainCard"></div>
        <div class="controls-row" id="controlsRow"></div>
      </div>`;
    await renderHeader(); ensureDebugTray();
    Game.mount(code);
  };

  // ---------- Static ----------
  pages.billing=async()=>{ const app=document.getElementById("app"); app.innerHTML=`
    <div class="offline-banner">You are offline. Trying to reconnect…</div>
    <div class="container"><div class="card" style="max-width:720px;margin:28px auto;">
      <h2>Billing</h2><div class="grid">
        <button class="btn" id="extend">Extend game by 60 min</button>
        <button class="btn secondary" id="extra">Buy extra weekly game</button>
        <button class="btn warn" id="sub">Subscribe</button>
      </div></div></div>`; await renderHeader(); ensureDebugTray();
    $("#extend").onclick=()=>toast("Simulated: extended"); $("#extra").onclick=()=>toast("Simulated: extra weekly game purchased"); $("#sub").onclick=()=>toast("Simulated: subscription active"); };
  pages.terms=async()=>{ const app=document.getElementById("app"); app.innerHTML=`<div class="container"><div class="card" style="margin:28px auto;max-width:840px;"><h2>Terms</h2><p class="help">…</p></div></div>`; await renderHeader(); ensureDebugTray(); };
  pages.privacy=async()=>{ const app=document.getElementById("app"); app.innerHTML=`<div class="container"><div class="card" style="margin:28px auto;max-width:840px;"><h2>Privacy</h2><p class="help">…</p></div></div>`; await renderHeader(); ensureDebugTray(); };
  pages.help=async()=>{ const app=document.getElementById("app"); app.innerHTML=`<div class="container"><div class="card" style="margin:28px auto;max-width:720px;"><h2>Help</h2><p class="help">…</p></div></div>`; await renderHeader(); ensureDebugTray(); };

  // ---------- Routes & boot ----------
  route("#/", pages.home);
  route("#/host", pages.host);
  route("#/join", pages.join);
  route("#/login", pages.login);
  route("#/account", pages.account);
  route("#/billing", pages.billing);
  route("#/terms", pages.terms);
  route("#/privacy", pages.privacy);
  route("#/help", pages.help);

  if (!location.hash) location.hash="#/";
  navigate();
  addEventListener("hashchange", navigate);
})();
