/*! MatchSqr New UI v3.0 — Mapped to original room logic (participants, answers, rounds, gating) */
(function(){
  const $ = (sel, root=document) => root.querySelector(sel);
  function toast(msg, ms=2200){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), ms); }
  function debug(obj){ try{ const pre=$("#debug-pre"); if(!pre) return; const s=pre.textContent + "\n" + JSON.stringify(obj,null,2); pre.textContent=s.slice(-30000); }catch{} }
  function setOfflineBanner(show){ const b=$(".offline-banner"); if(!b) return; b.classList.toggle("show", !!show); }
  addEventListener("offline",()=>setOfflineBanner(true));
  addEventListener("online",()=>setOfflineBanner(false));

  const CONFIG = window.CONFIG || {};
  const FUNCTIONS_BASE = (CONFIG.FUNCTIONS_BASE || "").replace(/\/+$/,"");

  // ---------- Supabase client ----------
  async function ensureClient(){
    if (window.__MS_CLIENT && window.__MS_CLIENT.auth && window.__MS_CLIENT.functions) return window.__MS_CLIENT;
    if (window.supabaseClient && window.supabaseClient.auth && window.supabaseClient.functions){ window.__MS_CLIENT = window.supabaseClient; return window.__MS_CLIENT; }
    if (window.supabase && window.supabase.auth && window.supabase.functions && window.supabase.from){ window.__MS_CLIENT = window.supabase; return window.__MS_CLIENT; }
    if (!window.supabase || !window.supabase.createClient){ throw new Error("[MS] Supabase UMD not loaded before app.js"); }
    let url="", key="";
    try{ const res=await fetch(FUNCTIONS_BASE+"/config"); if(res.ok){ const j=await res.json(); url=j.supabase_url||url; key=j.supabase_anon_key||key; } }catch(_){}
    url = url || CONFIG.SUPABASE_URL || CONFIG.FALLBACK_SUPABASE_URL || "";
    key = key || CONFIG.SUPABASE_ANON_KEY || CONFIG.FALLBACK_SUPABASE_ANON_KEY || "";
    if (!url || !key) throw new Error("[MS] Missing Supabase URL/Key. Ensure /config or config.js provides them.");
    const client = window.supabase.createClient(url, key, { auth: { storageKey: "ms-auth" } });
    window.__MS_CLIENT = client; window.supabaseClient = client; return client;
  }
  async function getSession(){ const sb=await ensureClient(); const { data } = await sb.auth.getSession(); return (data&&data.session)||null; }
  function authHeader(session){ const token=session?.access_token||""; return token?{Authorization:`Bearer ${token}`}:{ }; }

  // ---------- storage helpers ----------
  const arKey = "active_room";
  function storedRoom(){ try{ return JSON.parse(localStorage.getItem(arKey) || sessionStorage.getItem(arKey) || "null") || {}; }catch{return {};} }
  function saveActiveRoom(obj){
    const code = obj?.code || obj?.game_code || obj?.room_code;
    const id = obj?.id || obj?.game_id || obj?.room_id;
    const toSave = { ...(storedRoom()||{}), ...obj, code, id };
    localStorage.setItem(arKey, JSON.stringify(toSave));
    if (code && id) localStorage.setItem(msGidKey(code), JSON.stringify(id));
    if (code && obj?.participant_id) localStorage.setItem(msPidKey(code), JSON.stringify(obj.participant_id));
  }
  function msPidKey(code){ return `ms_pid_${code}`; }
  function msRoleKey(code){ return `ms_role_${code}`; }
  function msGidKey(code){ return `ms_gid_${code}`; }
  function setRole(code, role){ if(code && role) localStorage.setItem(msRoleKey(code), role); }
  function getRole(code){ try{ return localStorage.getItem(msRoleKey(code)) || ""; }catch{ return ""; } }
  function resolveCode(explicit){
    if (explicit) return explicit;
    const m = (location.hash||"").match(/^#\/game\/([^?]+)/);
    if (m) return m[1];
    const ar = storedRoom();
    return ar.code || ar.game_code || ar.room_code || null;
  }
  function resolveGameId(explicit){
    if (explicit) return explicit;
    const code = resolveCode(null);
    if (!code) return (storedRoom().id||storedRoom().game_id||null);
    try{ return JSON.parse(localStorage.getItem(msGidKey(code))||"null") || storedRoom().id || storedRoom().game_id || null; }catch{return storedRoom().id||storedRoom().game_id||null;}
  }

  // ---------- HTTP helpers ----------
  async function jpost(path, body){
    const session = await getSession();
    const res = await fetch(`${FUNCTIONS_BASE}/${path}`, { method:"POST", headers:{ "Content-Type":"application/json", ...authHeader(session) }, body: body? JSON.stringify(body): undefined });
    const text = await res.text(); let json=null; try{ json=text?JSON.parse(text):null; }catch{}
    if(!res.ok){ const e=new Error((json&&(json.message||json.error))||text||"Request failed"); e.status=res.status; e.data=json; throw e; }
    return json;
  }
  async function jget(pathWithQuery){
    const session = await getSession();
    const res = await fetch(`${FUNCTIONS_BASE}/${pathWithQuery}`, { headers: { ...authHeader(session) } });
    const text=await res.text(); let json=null; try{ json=text?JSON.parse(text):null; }catch{}
    if(!res.ok){ const e=new Error((json&&(json.message||json.error))||text||"Request failed"); e.status=res.status; e.data=json; throw e; }
    return json;
  }

  // ---------- API wrappers ----------
  const API = {
    create_game(){ return jpost("create_game", null); },
    get_state(p){ const code=resolveCode(p?.code); if(!code) throw new Error("Missing code"); return jget(`get_state?code=${encodeURIComponent(code)}`); },
    join_game_guest(p){
      const code=resolveCode(p?.code)||p?.code; if(!code) throw new Error("Missing code");
      const nickname = p?.nickname || p?.name || "";
      const existingPid = localStorage.getItem(msPidKey(code));
      const body = existingPid ? { code, participant_id: JSON.parse(existingPid) } : { code };
      if (nickname) body.nickname = nickname;
      return jpost("join_game_guest", body).then(data=>{
        const gid = data?.game_id || null;
        const isHost = !!data?.is_host;
        const pid = data?.participant_id || null;
        saveActiveRoom({ code, id: gid, participant_id: pid });
        if (isHost) setRole(code, "host"); else setRole(code, "guest");
        return data;
      });
    },
    start_game(p){ const gid=resolveGameId(p?.gameId||p?.id||null); if(!gid) throw new Error("Missing game id"); return jpost("start_game", { gameId: gid }); },
    next_question(p){ const gid=resolveGameId(p?.gameId||p?.id||null); if(!gid) throw new Error("Missing game id"); return jpost("next_question", { gameId: gid }); },
    end_game_and_analyze(p){ const gid=resolveGameId(p?.gameId||p?.id||null); if(!gid) throw new Error("Missing game id"); return jpost("end_game_and_analyze", { gameId: gid }); },
    heartbeat(p){ const gid=resolveGameId(p?.gameId||p?.id||null); if(!gid) throw new Error("Missing game id"); return jpost("heartbeat", { gameId: gid }); },
    participant_heartbeat(p){
      const code=resolveCode(p?.code||null); const gid=resolveGameId(p?.gameId||p?.id||null);
      if (!code || !gid) return Promise.resolve({ skipped:true });
      const pidRaw = localStorage.getItem(msPidKey(code)); if (!pidRaw) return Promise.resolve({ skipped:true });
      const pid = JSON.parse(pidRaw);
      return jpost("participant_heartbeat", { gameId: gid, participant_id: pid });
    },
    submit_answer(p){
      const code=resolveCode(p?.code||null); const gid=resolveGameId(p?.gameId||p?.id||null);
      const pidRaw = code ? localStorage.getItem(msPidKey(code)) : null;
      const pid = pidRaw ? JSON.parse(pidRaw) : undefined;
      const body = { game_id: gid, text: p?.text||p?.answer||"" , participant_id: pid };
      return jpost("submit_answer", body);
    }
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

  // ---------- UI helpers ----------
  async function shareRoom(code){
    const shareUrl = location.origin + location.pathname + "#/join";
    const text = "Join my MatchSqr game. Code: " + code;
    try{ if (navigator.share){ await navigator.share({ title:"MatchSqr Room", text, url:shareUrl }); return; } }catch(_){}
    try{ await navigator.clipboard.writeText(text + " " + shareUrl); toast("Invite copied"); }catch(_){ toast("Copy failed, share manually"); }
  }
  function participantsListHTML(ppl, curPid){
    if (!Array.isArray(ppl) || ppl.length===0) return '<ul id="participantsList"><li class="meta">No one yet</li></ul>';
    const li = ppl.map(p=>{
      const pid = p?.participant_id || p?.id || "";
      const name = p?.nickname || p?.name || "Player";
      const role = p?.role || "";
      const bold = (curPid && String(curPid)===String(pid)) ? ' style="font-weight:700;"' : '';
      const pidAttr = pid ? ` data-pid="${pid}"` : '';
      return `<li${pidAttr}${bold}>${name} <span class="meta">(${role})</span></li>`;
    }).join('');
    return `<ul id="participantsList">${li}</ul>`;
  }

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
      <a class="home-learn" href="#/terms">Learn more about MatchSqr</a>`;
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
      </div>`;
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
      </div>`;
    await renderHeader(); ensureDebugTray();
    $("#logoutBtn").onclick=async()=>{ const sb=await ensureClient(); await sb.auth.signOut(); location.hash="#/"; };
  };

  // ---------- Host ----------
  pages.host=async()=>{
    const session = await getSession();
    if (!session){ sessionStorage.setItem("__redirect_after_login", "#/host"); location.hash = "#/login"; return; }
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

    async function renderExisting(code){
      let state=null; try{ state = await API.get_state({ code }); }catch(e){ debug({ get_state_error:e.message }); }
      const phase = state?.status || state?.phase || "lobby";
      const players = Array.isArray(state?.participants||state?.players) ? (state.participants||state.players) : [];
      const gid = resolveGameId(null) || state?.id || state?.game_id || null;

      el.innerHTML = `
        <div class="grid">
          <div class="inline-actions">
            <span class="help">Code: <strong class="code-value">${code}</strong></span>
            <button class="icon-btn" id="copyCode" title="Copy code"><img src="./assets/copy.png" alt="copy"/></button>
            <button class="ghost" id="shareInvite">Share invite</button>
            <button class="primary" id="goRoom">Go to room</button>
          </div>
          <div class="help">Status: <strong>${phase}</strong> • Players: ${players.length}</div>
          <div>${participantsListHTML(players, (state?.current_turn&&state.current_turn.participant_id)||null)}</div>
        </div>`;

      $("#goRoom").onclick=()=>location.hash="#/game/"+code;
      $("#copyCode").onclick=()=>{ navigator.clipboard.writeText(code).then(()=>toast("Code copied")).catch(()=>toast("Copy failed")); };
      $("#shareInvite").onclick=()=>shareRoom(code);

      if (gid && code){ setRole(code, "host"); }
    }

    if (ar && (ar.code || ar.game_code || ar.id)){
      const code = ar.code || ar.game_code || ar.id;
      renderExisting(code);
    }else{
      el.innerHTML = `
        <div class="grid">
          <button class="primary" id="createGame">Create Game</button>
          <p class="help">You will receive a game code and a room for players to join.</p>
        </div>`;

      $("#createGame").onclick=async()=>{
        try{
          const data = await API.create_game();
          const code = data?.code || data?.game_code;
          const gid  = data?.id || data?.game_id;
          if (!code || !gid){ debug({ create_game_unexpected_response:data }); toast("Created, but missing code/id"); return; }
          saveActiveRoom({ code, id: gid, participant_id: data?.participant_id });
          setRole(code, "host");
          await renderExisting(code);
        }catch(e){
          if (e.status===409 && e.data){
            const code = e.data.code || e.data.game_code;
            const gid  = e.data.game_id || e.data.id;
            if (code && gid){
              saveActiveRoom({ code, id: gid });
              setRole(code, "host");
              toast("You already have an active room.");
              await renderExisting(code); return;
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
      </div>`;
    await renderHeader(); ensureDebugTray();
    $("#joinBtn").onclick=async()=>{
      const code=$("#gameId").value.trim(); const nickname=$("#nickname").value.trim();
      if (!code) return toast("Enter game code");
      if (!nickname) return toast("Enter nickname");
      try{
        await API.join_game_guest({ code, nickname });
        location.hash="#/game/"+code;
      }catch(e){ toast(e.message||"Failed to join"); debug({ join_error:e }); }
    };
  };

  // ---------- Game Room ----------
  const Game={
    code:null, poll:null, tick:null, hbH:null, hbG:null,
    state:{ status:"lobby", ends_at:null, endsAt:null, participants:[], question:null, current_turn:null },
    async mount(code){
      this.code=code;
      await this.refresh();
      this.startPolling();
      this.startTick();
      this.startHeartbeats();
    },
    startPolling(){ if(this.poll) clearInterval(this.poll); this.poll=setInterval(()=>this.refresh(), 3000); },
    startTick(){ if(this.tick) clearInterval(this.tick); this.tick=setInterval(()=>this.renderTimer(), 1000); },
    startHeartbeats(){
      const code=this.code; const gid=resolveGameId(null);
      if (this.hbH) { clearInterval(this.hbH); this.hbH=null; }
      if (this.hbG) { clearInterval(this.hbG); this.hbG=null; }
      const role = getRole(code);
      if (role === "host" && gid){
        const beat=()=>API.heartbeat({ gameId: gid }).catch(()=>{});
        this.hbH = setInterval(beat, 20000); beat();
      } else {
        const pid = JSON.parse(localStorage.getItem(msPidKey(code))||"null");
        if (pid && gid){
          const beat=()=>API.participant_heartbeat({ gameId: gid }).catch(()=>{});
          this.hbG = setInterval(beat, 25000); beat();
        }
      }
    },
    stop(){ if(this.poll) clearInterval(this.poll); if(this.tick) clearInterval(this.tick); if(this.hbH) clearInterval(this.hbH); if(this.hbG) clearInterval(this.hbG); },
    async refresh(){
      try{
        const out=await API.get_state({ code:this.code });
        // normalize
        this.state.status = out?.status || out?.phase || "lobby";
        this.state.ends_at = out?.ends_at || null;
        this.state.endsAt = out?.ends_at || out?.endsAt || null;
        this.state.participants = Array.isArray(out?.participants)? out.participants : (Array.isArray(out?.players)? out.players : []);
        this.state.question = out?.question || null;
        this.state.current_turn = out?.current_turn || null;
        this.render();
        this.startHeartbeats();
      }catch(e){ debug({ refresh_error:e.message }); }
    },
    remainingSeconds(){ if (!this.state.endsAt) return null; const diff=Math.floor((new Date(this.state.endsAt).getTime()-Date.now())/1000); return Math.max(0,diff); },
    renderTimer(){
      const t=this.remainingSeconds(), el=document.getElementById("roomTimer"); if(!el) return;
      if (t==null) { el.textContent="--:--"; return; }
      const m=String(Math.floor(t/60)).padStart(2,"0"), s=String(t%60).padStart(2,"0");
      el.textContent=`${m}:${s}`;
      const extendBtn=$("#extendBtn"); if (extendBtn){ extendBtn.toggleAttribute("disabled", !(t<=600)); }
    },
    localPid(){
      const code=this.code; try{ return JSON.parse(localStorage.getItem(msPidKey(code))||"null"); }catch{return null;}
    },
    canAnswer(){
      const pid = this.localPid();
      const cur = this.state.current_turn && this.state.current_turn.participant_id;
      return pid && cur && String(pid)===String(cur);
    },
    inRoomHeader(main){
      const header=document.createElement("div");
      header.style.cssText="position:absolute; top:16px; left:16px; display:flex; gap:8px; align-items:center;";
      const code = this.code;
      header.innerHTML = `
        <span class="code-pill"><span>Code</span> <strong class="code-value">${code}</strong></span>
        <button id="copyInRoom" class="icon-btn" title="Copy code"><img src="./assets/copy.png" alt="copy"/></button>
        <button id="shareInRoom" class="icon-btn" title="Share invite"><img src="./assets/share.png" alt="share"/></button>`;
      main.appendChild(header);
      $("#copyInRoom").onclick=()=>{ navigator.clipboard.writeText(code).then(()=>toast("Code copied")).catch(()=>toast("Copy failed")); };
      $("#shareInRoom").onclick=()=>{ shareRoom(code); };
    },
    participantsBlock(){
      const curPid = (this.state.current_turn && this.state.current_turn.participant_id) || null;
      return participantsListHTML(this.state.participants, curPid);
    },
    roundText(){
      const ct = this.state.current_turn || {};
      const n = ct.round || ct.turn || ct.index || null;
      return n ? `Round ${n}` : '';
    },
    render(){
      const s=this.state; const main=$("#mainCard"); const controls=$("#controlsRow");
      if (!main || !controls) return;
      main.innerHTML=""; controls.innerHTML="";
      const role = getRole(this.code); const isHost = role==="host";
      const minPlayers = 2;
      const enoughPlayers = Array.isArray(s.participants) ? s.participants.length >= minPlayers : false;

      this.inRoomHeader(main);

      if (s.status==="lobby"){
        const wrap=document.createElement("div"); wrap.style.cssText="display:flex;flex-direction:column;align-items:center;gap:10px; text-align:center; max-width:640px;";
        const plist=document.createElement("div"); plist.innerHTML=this.participantsBlock(); wrap.appendChild(plist);
        if (isHost){
          const startBtn=document.createElement("button"); startBtn.className="start-round"; startBtn.id="startGame"; startBtn.textContent="Start";
          startBtn.disabled = !enoughPlayers;
          startBtn.onclick=async()=>{
            if(!enoughPlayers) return toast(`Need at least ${minPlayers} players`);
            try{ await API.start_game({}); await this.refresh(); }catch(e){ toast(e.message||"Start failed"); debug({ start_error:e }); }
          };
          const help=document.createElement("div"); help.className="help";
          help.textContent = enoughPlayers ? "Ready to start." : `Need at least ${minPlayers} players to start.`;
          wrap.appendChild(startBtn); wrap.appendChild(help);
        }else{
          const wait=document.createElement("div"); wait.className="help"; wait.textContent="Waiting for the host…";
          wrap.appendChild(wait);
        }
        main.appendChild(wrap);
        return;
      }

      if (s.status==="running"){
        const topRight=document.createElement("div"); topRight.style.cssText="position:absolute; top:16px; right:16px; font-weight:800; display:flex; gap:12px; align-items:center;";
        topRight.innerHTML='<span class="meta">'+(this.roundText()||'')+'</span> ⏱ <span id="roomTimer">--:--</span>'; main.appendChild(topRight);

        // Question
        const q=document.createElement("div"); q.style.cssText="text-align:center; max-width:640px; padding:8px";
        q.innerHTML = `<h3 style="margin:0 0 8px 0;">${s.question?.title || "Question"}</h3><p class="help" style="margin:0;">${s.question?.text || ""}</p>`;
        main.appendChild(q);

        // Participants list (side block under question)
        const plist=document.createElement("div"); plist.innerHTML=this.participantsBlock(); plist.style.marginTop="6px"; main.appendChild(plist);

        // Answer area
        const ans=document.createElement("div"); ans.className="card"; ans.id="msAnsGuest"; ans.style.marginTop="8px";
        const enabled = this.canAnswer();
        ans.innerHTML = `
          <div class="meta">Your answer</div>
          <div class="row" style="gap:8px;margin:6px 0;">
            <button class="btn" data-ms="kb"${enabled?'':' disabled'}>⌨️ Type</button>
            <button class="btn" data-ms="done"${enabled?'':' disabled'}>Done</button>
            <button class="btn" data-ms="submit"${enabled?'':' disabled'}>Submit</button>
          </div>
          <textarea data-ms="box" class="input" rows="3" placeholder="${enabled?'Type here…':'Wait for your turn'}" ${enabled?'':'disabled'}></textarea>`;
        main.appendChild(ans);

        const box = ans.querySelector('[data-ms="box"]');
        const submit = ans.querySelector('[data-ms="submit"]');
        submit.onclick=async()=>{
          const text=(box.value||'').trim(); if(!text) return;
          try{ submit.disabled=true; await API.submit_answer({ text }); box.value=""; await this.refresh(); }catch(e){ submit.disabled=false; toast(e.message||"Submit failed"); debug({ submit_error:e }); }
        };

        // Controls (host only)
        if (isHost){
          controls.innerHTML=`
            <button id="nextCard" class="btn">Reveal next card</button>
            <button id="extendBtn" class="btn secondary" disabled>Extend</button>
            <button id="endAnalyze" class="btn danger">End and analyze</button>`;
          $("#nextCard").onclick=async()=>{ try{ await API.next_question({}); await this.refresh(); }catch(e){ toast(e.message||"Next failed"); debug({ next_error:e }); } };
          $("#extendBtn").onclick=()=>{ location.hash="#/billing"; };
          $("#endAnalyze").onclick=async()=>{ try{ await API.end_game_and_analyze({}); await this.refresh(); }catch(e){ toast(e.message||"End failed"); debug({ end_error:e }); } };
        }
        this.renderTimer();
        return;
      }

      if (s.status==="ended"){
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
        $("#shareBtn").onclick=()=>{ navigator.clipboard.writeText(location.href).then(()=>toast("Link copied")).catch(()=>toast("Copy failed")); };
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
