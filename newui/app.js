(function(){
  const $ = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));
  function cls(el, name, on){ if(!el) return; if(on===undefined) return el.classList.contains(name); el.classList.toggle(name, !!on); }
  function toast(msg, ms=2400){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.classList.add("show"), 10); setTimeout(()=>{ t.classList.remove("show"); setTimeout(()=>t.remove(), 300); }, ms); }
  function dbg(obj){ const pre=$("#debug-pre"); if(!pre) return; const s=(pre.textContent||"") + "\n" + JSON.stringify(obj,null,2); pre.textContent = s.slice(-40000); }
  function setOfflineBanner(show){ const b=$(".offline-banner"); if(b) b.classList.toggle("show", !!show); }
  window.addEventListener("offline",()=>setOfflineBanner(true));
  window.addEventListener("online",()=>setOfflineBanner(false));

  const CFG=(function(){ const c=(window.CONFIG||{}); const base=(c.FUNCTIONS_BASE||"").replace(/\/+$/,""); return { FUNCTIONS_BASE:base, SUPABASE_URL:c.SUPABASE_URL||window.SUPABASE_URL||window.__SUPABASE_URL||"", SUPABASE_ANON_KEY:c.SUPABASE_ANON_KEY||window.SUPABASE_KEY||window.__SUPABASE_KEY||"" }; })();

  let supabase=null;
  async function ensureSupabase(){ if(supabase) return supabase; const g=(typeof globalThis!=="undefined"?globalThis:window); if(!g.supabase) return null; supabase=g.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); return supabase; }
  async function authHeaders(){ const h={"Content-Type":"application/json"}; try{ const sb=await ensureSupabase(); const { data } = sb? await sb.auth.getSession() : {data:null}; const token=data?.session?.access_token||""; const key=CFG.SUPABASE_ANON_KEY||token; if(key){h["apikey"]=CFG.SUPABASE_ANON_KEY||key;} if(token){h["Authorization"]="Bearer "+token;} else if(CFG.SUPABASE_ANON_KEY){h["Authorization"]="Bearer "+CFG.SUPABASE_ANON_KEY;} }catch(e){} return h; }
  function joinPath(base, path){ return (base||"").replace(/\/+$/,"") + "/" + (path||"").replace(/^\/+/,""); }

  const store={ set(k,v,remember=false){ (remember?localStorage:sessionStorage).setItem(k, JSON.stringify(v)); }, get(k){ try{ const a=localStorage.getItem(k); const b=sessionStorage.getItem(k); const raw=(a!==null)?a:b; return raw?JSON.parse(raw):null; }catch(e){ return null; } }, del(k){ localStorage.removeItem(k); sessionStorage.removeItem(k); } };

  async function edge(path, { method="POST", query, body }={}){
    let url = joinPath(CFG.FUNCTIONS_BASE, path);
    if (query && typeof query==="object"){ const sp=new URLSearchParams(); Object.entries(query).forEach(([k,v])=>{ if(v!==undefined&&v!==null) sp.append(k,v); }); url += "?" + sp.toString(); }
    const headers = await authHeaders();
    const init = { method, headers }; if (body!==undefined) init.body = JSON.stringify(body);
    dbg({ edge:{ url, method, body } });
    const res = await fetch(url, init); const text = await res.text(); let data=null; try{ data=JSON.parse(text);}catch{};
    dbg({ edge_result:{ status:res.status, data, text:data?undefined:text } });
    if (!res.ok){ const err=new Error((data&&data.message)||text||"Request failed"); err.status=res.status; err.data=data; throw err; }
    return data||{};
  }

  const API = {
    createGame: (opts)=> edge("/create_game", { body: opts||{} }),
    joinGuest: (p)=>{ const code=p.game_code||p.code; return edge("/join_game_guest",{ body:{ ...p, game_code:code, code } }); },
    startGame: (p)=>{ const code=p.game_code||p.code; return edge("/start_game",{ body:{ ...p, game_code:code, code } }); },
    nextQuestion: (p)=>{ const code=p.game_code||p.code; return edge("/next_question",{ body:{ ...p, game_code:code, code } }); },
    endAnalyze: (p)=>{ const code=p.game_code||p.code; return edge("/end_game_and_analyze",{ body:{ ...p, game_code:code, code } }); },
    getState: async (code)=>{ try{ return await edge("/get_state",{ method:"GET", query:{ code } }); }catch(e){ if(e.status) throw e; return await edge("/get_state",{ method:"GET", query:{ game_code:code } }); } }
  };

  function normalizeState(srv){ if(!srv||typeof srv!=="object") return null;
    return { phase: srv.status||srv.phase||null, players: Array.isArray(srv.participants)? srv.participants.map(p=>({id:p.id,name:p.name,role:p.role,seat_index:p.seat_index})) : (srv.players||[]), active_player_id: srv.current_turn?.player_id || srv.active_player_id || null, question: srv.question ?? null, ends_at: srv.ends_at ?? null, level: srv.level || null, can_reveal: !!srv.can_reveal };
  }

  const routes={}; function route(path, handler){ routes[path]=handler; }
  function currentHash(){ return location.hash || "#/"; }
  function parseHash(){ const h=currentHash(); const [p,q]=h.split("?"); return { path:p, query:Object.fromEntries(new URLSearchParams(q)) }; }
  async function navigate(){ const { path } = parseHash(); const m=path.match(/^#\/game\/(.+)$/); if (routes[path]) return routes[path](); if (m) return pages.game(m[1]); return pages.home(); }
  window.addEventListener("hashchange", navigate);

  const Session={ user:null,
    async load(){ const sb=await ensureSupabase(); if(!sb) return null; const { data:{ session } } = await sb.auth.getSession(); this.user = session?.user || null; return this.user; },
    onChange(cb){ ensureSupabase().then(sb=>{ if(!sb) return; sb.auth.onAuthStateChange((_e,sess)=>{ Session.user = sess?.user || null; cb(Session.user); }); }); },
    async signInEmail(email){ const sb=await ensureSupabase(); if(!sb) throw new Error("Supabase not loaded"); const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: window.location.origin + "/#/host" } }); if (error) throw error; return true; },
    async signOut(){ const sb=await ensureSupabase(); if(!sb) return; await sb.auth.signOut(); }
  };

  function profileMenu(user){ const email=user?.email||"Account"; return `<div class="profile"><button class="avatar-btn" id="navProfileBtn"><img src="./assets/profile.png" alt="me"/></button><div class="menu" id="navProfileMenu"><div class="menu-item muted">${email}</div><button class="menu-item" id="navLogout">Logout</button></div></div>`; }
  function wireProfileMenu(){ const btn=$("#navProfileBtn"); const menu=$("#navProfileMenu"); if(!btn||!menu) return; btn.onclick=(e)=>{ e.stopPropagation(); menu.classList.toggle("open"); }; document.addEventListener("click", ()=>menu.classList.remove("open"), { once:true }); const logout=$("#navLogout"); if(logout) logout.onclick=async()=>{ await Session.signOut(); toast("Logged out"); await redraw(); }; }

  function navHome(){ return `<div class="nav home"><a class="brand" href="#/"><img src="./assets/logo.png" alt="logo"/><span>MatchSqr</span></a><div class="right">${Session.user ? profileMenu(Session.user) : `<a class="btn-login" href="#/login">Login</a>`}</div></div>`; }
  function navApp(){ return `<div class="nav app container"><a class="brand" href="#/"><img src="./assets/logo.png" alt="logo"/><span>MatchSqr</span></a><div class="right"><a class="btn ghost" href="#/host">Host</a><a class="btn ghost" href="#/join">Join</a>${Session.user ? profileMenu(Session.user) : `<a class="btn-login" href="#/login">Login</a>`}</div></div>`; }

  async function redraw(){ const { path } = parseHash(); if (path==="#/host") pages.host(); else if (path==="#/join") pages.join(); else if (path.startsWith("#/game/")) { const code=path.split("/")[2]; pages.game(code); } else if (path==="#/login") pages.login(); else pages.home(); }
  function render(content, variant="app"){ const app=document.getElementById("app"); app.innerHTML = `<div class="offline-banner">You are offline. Trying to reconnect…</div>${variant==="home"?navHome():navApp()}${content}<div class="debug-tray" id="debug-tray"><pre id="debug-pre"></pre></div>`; if (parseHash().query.debug==="1") $("#debug-tray").style.display="block"; setOfflineBanner(!navigator.onLine); wireProfileMenu(); }

  const pages={};
  pages.home=()=>{ render(`<section class="hero"><img class="globe" src="./assets/globe.png" alt="globe"/><h1>Safe space to build meaningful connections.</h1><p>Play with other people interactive games designed to uncover shared values, emotional style, interests, and personality.</p><div class="cta-row"><a class="cta" href="#/host"><img src="./assets/crown.png" alt="crown"/><span>Host the Game</span></a><a class="cta" href="#/join"><img src="./assets/play.png" alt="play"/><span>Join the Game</span></a></div></section><a class="learn-more" href="#/terms">Learn more about MatchSqr</a>`, "home"); };

  pages.login=()=>{ render(`<section class="container" style="max-width:520px;"><div class="card"><h2>Login</h2><p class="help">Enter your email and we’ll send you a magic link.</p><div class="grid"><input id="email" class="input" type="email" placeholder="you@example.com"/><button id="sendLink" class="btn">Send magic link</button></div></div></section>`); $("#sendLink").onclick=async()=>{ const email=$("#email").value.trim(); if(!email) return toast("Enter your email"); try{ await Session.signInEmail(email); toast("Magic link sent. Check your email."); }catch(e){ toast(e.message||"Failed to send link"); } }; };

  pages.host=()=>{ render(`<section class="container"><div class="card"><h2>Host a game</h2><div id="hostControls"></div></div></section>`); const root=$("#hostControls"); const active=store.get("active_room"); if(active&&active.game_code){ root.innerHTML = `<div class="grid"><div>Active room: <strong>${active.game_code}</strong></div><div class="row"><button id="goRoom" class="btn">Go to Game Room</button><button id="copyInvite" class="btn ghost">Copy invite</button></div></div>`; $("#goRoom").onclick=()=>{ location.hash="#/game/"+active.game_code; }; $("#copyInvite").onclick=()=>{ navigator.clipboard.writeText(location.origin + "/#/game/" + active.game_code); toast("Invite copied"); }; return; } root.innerHTML = `<div class="grid"><button id="createGame" class="btn">Create Game</button><p class="help">You will receive a game code and lobby page to invite players.</p></div>`; $("#createGame").onclick=async()=>{ try{ const data=await API.createGame({}); store.set("active_room",{ game_code:data.game_code }, true); location.hash="#/game/"+data.game_code; }catch(e){ if(e.status===409 && e.data?.error==="host_has_active_game" && e.data.code){ store.set("active_room", { game_code:e.data.code }, true); toast("You have an active game. Opening existing room."); location.hash="#/game/"+e.data.code; return; } toast(e.message||"Failed to create"); } }; };

  pages.join=()=>{ render(`<section class="container" style="max-width:520px;"><div class="card"><h2>Join a game</h2><div class="grid"><input id="gameId" class="input" placeholder="Game code"/><input id="nickname" class="input" placeholder="Nickname (optional)"/><button id="joinBtn" class="btn" style="margin-top:8px;">Join</button></div></div></section>`); $("#joinBtn").onclick=async()=>{ const code=$("#gameId").value.trim(); const nickname=$("#nickname").value.trim()||undefined; if(!code) return toast("Enter game code"); try{ const data=await API.joinGuest({ game_code:code, nickname }); if(data&&data.player_id) store.set("player_id", data.player_id, true); store.set("active_room",{ game_code:code }, true); location.hash="#/game/"+code; }catch(e){ toast(e.message||"Failed to join"); } }; };

  const Room = { code:null, poller:null, state:{ phase:null, players:[], active_player_id:null, question:null, ends_at:null, can_reveal:false },
    async mount(code){ this.code=code; render(`<section class="container"><div id="gameRoot"></div></section>`); $("#gameRoot").innerHTML = `<div class="room"><div class="room-head"><div class="left"><span class="dots"><i class="dot simple"></i><i class="dot medium"></i><i class="dot deep"></i></span><span class="timer" id="roomTimer">--:--</span></div><div class="right"><button class="icon" id="btnCopy" title="Copy link"><img src="./assets/copy.png" alt="copy"/></button><button class="icon" id="btnShare" title="Share"><img src="./assets/share.png" alt="share"/></button><button class="avatar-btn small" id="roomProfile"><img class="avatar" src="./assets/profile.png" alt="me"/></button></div></div><div id="roomBody"></div></div>`; $("#btnCopy").onclick=()=>{ navigator.clipboard.writeText(location.href); toast("Link copied"); }; $("#btnShare").onclick=async()=>{ try{ if(navigator.share){ await navigator.share({ url:location.href, title:"Join my MatchSqr game" }); } else { await navigator.clipboard.writeText(location.href); toast("Link copied"); } }catch{} }; $("#roomProfile").onclick=()=>{ location.hash="#/login"; }; this.render(); await this.refresh(); this.start(); },
    start(){ if(this.poller) clearInterval(this.poller); this.poller=setInterval(()=>this.refresh(), 3000); },
    stop(){ if(this.poller) clearInterval(this.poller); this.poller=null; },
    async refresh(){ try{ const srv=await API.getState(this.code); const data=normalizeState(srv); if(!data) return; this.state={ ...this.state, ...data }; this.render(); }catch(e){ dbg({ refresh_error:e.message }); } },
    countdown(iso){ if(!iso) return "--:--"; const end=new Date(iso).getTime(); const diff=Math.max(0, Math.floor((end-Date.now())/1000)); const m=String(Math.floor(diff/60)).padStart(2,"0"); const s=String(diff%60).padStart(2,"0"); return m+":"+s; },
    isHost(){ const host=(this.state.players||[]).find(p=>p.role==="host"); try{ const raw=localStorage.getItem("supabase.auth.token"); if(raw){ const obj=JSON.parse(raw); const uid=obj?.currentSession?.user?.id || obj?.user?.id; if(uid && host && uid===host.id) return true; } }catch{} const pid=store.get("player_id"); if(pid && host && pid===host.id) return true; return false; },
    render(){ const root=$("#roomBody"); const s=this.state; $("#roomTimer").textContent = (s.phase==="running") ? this.countdown(s.ends_at) : "--:--";
      if (!s.phase){ root.innerHTML=`<div class="card"><p class="help">Loading room…</p></div>`; return; }
      if (s.phase==="lobby"){ const players=(s.players||[]).map(p=>`<li>${p.name||"Player"} ${p.role==="host"?"<span class='role'>host</span>":""}</li>`).join(""); const showStart = this.isHost();
        root.innerHTML = `<div class="card"><div class="row spread"><div>Game code: <strong>${this.code}</strong></div></div><div class="players"><h3>Players</h3><ul>${players || "<li>No players yet</li>"}</ul></div>${showStart? `<div class="actions"><button id="btnStart" class="btn">Start</button></div>`: ``}</div>`;
        if (showStart){ $("#btnStart").onclick=async()=>{ try{ await API.startGame({ game_code:this.code }); await this.refresh(); }catch(e){ toast(e.message||"Start failed"); } }; } return; }
      if (s.phase==="running"){ const isActive = store.get("player_id") && store.get("player_id")===s.active_player_id; const qTitle=s.question?.title || "Question"; const qText=s.question?.text || ""; const remaining=this.countdown(s.ends_at); $("#roomTimer").textContent=remaining; const canExtend=(function(){ const [mm,ss]=(remaining||"0:0").split(":").map(v=>parseInt(v)||0); return (mm*60+ss)<=600; })();
        root.innerHTML = `<div class="card"><div class="row spread"><h3 class="q-title">${qTitle}</h3><button class="btn ghost" id="btnClarify">?</button></div><p class="q-text">${qText}</p><div class="answer-row"><button class="icon" id="btnMic" ${isActive?"":"disabled"}><img src="./assets/mic.png" alt="mic"/></button><input id="answer" class="input" placeholder="Type your answer…" ${isActive?"":"disabled"} /><button id="btnSubmit" class="btn" ${isActive?"":"disabled"}>Submit</button></div></div><div class="row wrap gap"><button id="btnNext" class="btn">Reveal next card</button><a id="btnExtend" class="btn ghost" ${canExtend?"":"aria-disabled='true'"} href="#/billing">Extend</a><button id="btnEnd" class="btn danger">End and analyze</button></div><dialog id="dlgClarify" class="dialog"><div class="card"><h3>Clarification</h3><p class="help">Short explanation.</p><div class="row right"><button class="btn ghost" id="btnCloseClarify">Close</button></div></div></dialog>`;
        $("#btnClarify").onclick=()=>$("#dlgClarify").showModal(); $("#btnCloseClarify").onclick=()=>$("#dlgClarify").close();
        $("#btnSubmit").onclick=async()=>{ if(!isActive) return; const text=$("#answer").value.trim(); if(!text) return; try{ await API.nextQuestion({ game_code:this.code, answer:text }); $("#answer").value=""; await this.refresh(); }catch(e){ toast(e.message||"Submit failed"); } };
        $("#btnNext").onclick=async()=>{ try{ await API.nextQuestion({ game_code:this.code }); await this.refresh(); }catch(e){ toast(e.message||"Next failed"); } };
        $("#btnEnd").onclick=async()=>{ try{ await API.endAnalyze({ game_code:this.code }); await this.refresh(); }catch(e){ toast(e.message||"End failed"); } };
        return; }
      if (s.phase==="ended"){ root.innerHTML = `<div class="card"><h3>Summary</h3><p class="help">A quick view of how the game went. Full report can be emailed.</p><div class="row wrap gap"><button id="btnEmail" class="btn">Email me my full report</button><button id="btnShare2" class="btn ghost">Share</button></div><p class="help">Note, data is retained for about 30 minutes.</p></div>`; $("#btnEmail").onclick=()=>toast("Report requested. Check your email."); $("#btnShare2").onclick=()=>{ navigator.clipboard.writeText(location.href); toast("Link copied"); }; return; }
      root.innerHTML = `<div class="card"><p class="help">Loading…</p></div>`; }
  };

  route("#/", ()=>pages.home());
  route("#/host", ()=>pages.host());
  route("#/join", ()=>pages.join());
  route("#/login", ()=>pages.login());

  (async function(){ if(!location.hash) location.hash="#/"; const app=document.getElementById("app"); if(app && !document.getElementById("debug-tray")){ app.insertAdjacentHTML("beforeend", `<div class="debug-tray" id="debug-tray"><pre id="debug-pre"></pre></div>`); } await ensureSupabase(); await Session.load(); Session.onChange(async()=>{ await redraw(); }); await navigate(); })();
})();
