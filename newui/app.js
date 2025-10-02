/* New UI wired to existing functionality.
   Fallback mini-router included if msRouter isn't present.
*/
(function(){
  // -------- Minimal router fallback (keeps your existing msRouter if present) --------
  if (!window.msRouter){
    const routes = [];
    const root = document.getElementById("app");
    function match(hash){ return routes.find(r=>hash.startsWith(r.path)); }
    function start(){
      const h = location.hash || "#/";
      const r = match(h) || routes.find(r=>r.path==="#/");
      r && r.handler(root, new URLSearchParams(h.split("?")[1]||""));
    }
    window.addEventListener("hashchange", start);
    window.msRouter = {
      add: (path, handler)=>routes.push({path, handler}),
      start
    };
  }

  const tpl = (id)=>document.getElementById(id)?.content?.cloneNode(true);
  const byId = (id, root=document)=>root.getElementById(id);

  function setAuthNav(){
    const login = document.getElementById("navLogin");
    const acc = document.getElementById("navAccount");
    const email = window.msApi?.getUserEmail?.() || null;
    if (!login || !acc) return;
    if (email){ login.classList.add("hidden"); acc.classList.remove("hidden"); acc.title = email; }
    else { login.classList.remove("hidden"); acc.classList.add("hidden"); acc.title=""; }
  }

  // Helpers
  function parseLobbyCodeFromHash(){
    const m = (location.hash||"").match(/#\/host\/lobby\/([^?#]+)/i);
    return m ? decodeURIComponent(m[1]) : "";
  }
  function setGameCodeInDom(root, code){
    const sels = ['#lobbyId','#gameId','#code','.game-code','.js-game-code','[data-game-code]'];
    sels.flatMap(sel => Array.from(root.querySelectorAll(sel))).forEach(n=>{
      if (!n) return;
      if (n.tagName==='INPUT'||n.tagName==='TEXTAREA') n.value=code;
      else n.textContent=code;
    });
  }

  // ------------------ Routes ------------------
  msRouter.add("#/", async (root)=>{
    root.innerHTML=""; root.appendChild(tpl("tpl-home"));
    try{ await msApi.ensureConfig(); }catch{}
    setAuthNav();
    root.querySelector("#homeHostBtn").addEventListener("click", async (ev)=>{
      ev.preventDefault();
      try{
        if (!msApi.getUserEmail()){ location.hash="#/login?return=host"; return; }
        const out = await msApi.createGame();
        if (out && out.participant_id) msApi.setDevicePid(out.code, out.participant_id);
        location.hash = "#/host/lobby/" + out.code;
      }catch(e){ alert("Please login to host a game."); location.hash="#/login?return=host"; }
    });
  });

  async function renderHostLobby(root){
    document.body.classList.remove("is-immersive");
    try{ await msApi.ensureConfig(); }catch{}
    setAuthNav();
    root.innerHTML=""; root.appendChild(tpl("tpl-host-lobby"));
    const code = parseLobbyCodeFromHash();
    setGameCodeInDom(root, code);
    root.querySelector("#copyId")?.addEventListener("click", async ()=>{
      try{ await navigator.clipboard.writeText(code); alert("Copied Game ID"); }catch{}
    });
    root.querySelector("#startBtn")?.addEventListener("click", async ()=>{
      try{
        const st = await msApi.getState({ code });
        if (!st?.id) throw new Error("Game not found. Create a new one.");
        await msApi.startGame(st.id);
        location.hash = "#/game/" + code;
      }catch(e){ alert(e.message || String(e)); }
    });
  }
  msRouter.add("#/host/lobby", renderHostLobby);

  msRouter.add("#/join", async (root)=>{
    document.body.classList.remove("is-immersive");
    try{ await msApi.ensureConfig(); }catch{}
    setAuthNav();
    root.innerHTML=""; root.appendChild(tpl("tpl-join"));
    root.querySelector("#joinBtn").addEventListener("click", async ()=>{
      try{
        const name = root.querySelector("#joinName").value.trim();
        const code = root.querySelector("#joinCode").value.trim();
        if (!code) return alert("Enter Game ID");
        await msApi.joinGameGuest(code, name || null);
        location.hash = "#/game/" + code;
      }catch(e){ alert("Join failed: "+(e.message||e)); }
    });
  });

  msRouter.add("#/register", async (root)=>{
    document.body.classList.remove("is-immersive");
    try{ await msApi.ensureConfig(); }catch{}
    setAuthNav();
    root.innerHTML=""; root.appendChild(tpl("tpl-register"));
    root.querySelector("#regBtn").addEventListener("click", async ()=>{
      const email = root.querySelector("#regEmail").value.trim();
      const pass = root.querySelector("#regPassword").value;
      const msg = root.querySelector("#regMsg"); msg.textContent="";
      try{ await msApi.register(email, pass); msg.textContent="Check your email to confirm, then login."; }
      catch(e){ msg.textContent=e.message||String(e); }
    });
  });

  msRouter.add("#/login", async (root, params)=>{
    document.body.classList.remove("is-immersive");
    try{ await msApi.ensureConfig(); }catch{}
    setAuthNav();
    root.innerHTML=""; root.appendChild(tpl("tpl-login"));
    root.querySelector("#loginBtn").addEventListener("click", async ()=>{
      const email=root.querySelector("#loginEmail").value.trim();
      const pass=root.querySelector("#loginPassword").value;
      const remember=root.querySelector("#rememberMe").checked;
      const msg=root.querySelector("#loginMsg"); msg.textContent="";
      try{
        await msApi.login(email, pass, remember);
        setAuthNav();
        const q = new URLSearchParams(location.hash.split("?")[1]||"");
        if (q.get("return")==="host"){
          const out = await msApi.createGame();
          if (out && out.participant_id) msApi.setDevicePid(out.code, out.participant_id);
          location.hash="#/host/lobby/"+out.code;
        } else { location.hash="#/"; }
      }catch(e){ msg.textContent = e.message || String(e); }
    });
  });

  msRouter.add("#/account", async (root)=>{
    document.body.classList.remove("is-immersive");
    try{ await msApi.ensureConfig(); }catch{}
    setAuthNav();
    root.innerHTML="";
    const email = msApi.getUserEmail();
    const wrap=document.createElement("section"); wrap.className="join";
    wrap.innerHTML = email ?
      `<h1 class="title-xl">Account</h1><p class="muted">Signed in as <b>${email}</b></p><button id="logoutBtn" class="btn">Logout</button>` :
      `<h1 class="title-xl">Account</h1><p class="muted">You are not logged in.</p><a class="btn btn--green" href="#/login">Login</a>`;
    root.appendChild(wrap);
    wrap.querySelector("#logoutBtn")?.addEventListener("click", async ()=>{ await msApi.logout(); setAuthNav(); location.hash="#/"; });
  });

  // ------------------ Game ------------------
  const Game = { code:null, gameId:null, endsAt:null, poll:null, tick:null, participants:[], activeId:null, hostId:null, question:null, canReveal:false };

  function clearTimers(){ if (Game.poll) clearInterval(Game.poll); Game.poll=null; if (Game.tick) clearInterval(Game.tick); Game.tick=null; }

  function computeEndsAt(st){
    if (st?.ends_at) return st.ends_at;
    const left = st?.time_left_ms ?? st?.time_remaining_ms ?? (st?.seconds_left? st.seconds_left*1000 : null);
    return left!=null ? new Date(Date.now()+Number(left)).toISOString() : null;
  }

  function placeSeats(el, list, activeId, hostId){
    if (!el) return;
    el.innerHTML="";
    const rect = el.getBoundingClientRect();
    const cx = rect.width/2, cy = rect.height/2;
    const R = Math.max(120, Math.min(cx, cy) - 120);
    const start = -Math.PI/2;
    const N = Math.max(1, list.length);
    list.forEach((p,i)=>{
      const a = start + i*(2*Math.PI/N);
      const x = cx + R*Math.cos(a);
      const y = cy + R*Math.sin(a);
      const seat = document.createElement("div");
      seat.className = "seat" + (String(p.id)===String(hostId)?" host":"") + (String(p.id)===String(activeId)?" active":"");
      seat.style.left = Math.round(x-32) + "px";
      seat.style.top  = Math.round(y-32) + "px";
      const initials = (p.initials || (p.name||"").split(/\s+/).map(s=>s[0]).join("").toUpperCase().slice(0,2));
      seat.innerHTML = `<div class="badge">${initials}</div>${String(p.id)===String(hostId)?'<div class="crown">👑</div>':''}<div class="name">${p.name||""}</div>`;
      el.appendChild(seat);
    });
  }

  function setTimerUI(root){
    const timeEl = byId("timeLeft", root);
    const ext = byId("extendBtn", root);
    if (!timeEl) return;
    if (!Game.endsAt){ timeEl.textContent="--:--"; if (ext) ext.disabled=true; return; }
    const leftMs = new Date(Game.endsAt).getTime() - Date.now();
    const m = Math.max(0, Math.floor(leftMs/60000));
    const s = Math.max(0, Math.floor((leftMs%60000)/1000));
    timeEl.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}m`;
    if (ext) ext.disabled = m > 10;
  }

  function reflectState(root, st){
    Game.gameId = st.id ?? Game.gameId;
    Game.endsAt = computeEndsAt(st) ?? Game.endsAt;
    Game.participants = st.participants || st.players || Game.participants;
    Game.activeId = st.active_participant_id || (st.current_turn && (st.current_turn.participant_id || st.current_turn.id)) || Game.activeId;
    Game.hostId = st.host_participant_id || (Array.isArray(Game.participants)? (Game.participants.find(p=>p.role==="host"||p.is_host)?.id) : null) || Game.hostId;
    Game.question = st.question || st.card || Game.question;
    Game.canReveal = !!(st.can_reveal || st.next_available || st.allow_next);

    placeSeats(root.querySelector(".seats"), Game.participants, Game.activeId, Game.hostId);
    const qEl = root.querySelector(".card__text");
    if (qEl && Game.question) qEl.innerHTML = (Game.question.text||"").replace(/\n/g,"<br/>");

    // Level reflect (read-only)
    const level = (Game.question && Game.question.level) || "icebreaker";
    root.querySelectorAll('.levels input[name="lvl"]').forEach((inp, idx)=>{
      const map = {0:"icebreaker",1:"get_to_know_you",2:"real_you"};
      inp.checked = (map[idx]===level || (idx===0 && level==="simple") || (idx===1 && level==="medium") || (idx===2 && level==="deep"));
    });

    // Reveal button for host (present even if disabled)
    const myPid = msApi.getDevicePid(Game.code);
    const iAmHost = String(Game.hostId) === String(myPid);
    let rev = root.querySelector("#revealBtnDyn");
    if (iAmHost && !rev){
      rev = document.createElement("button");
      rev.id = "revealBtnDyn"; rev.className="btn"; rev.textContent="Reveal next card";
      root.querySelector(".game-top .actions")?.prepend(rev);
      rev.addEventListener("click", async ()=>{
        try{ await msApi.revealNext(Game.code, Game.gameId); }catch(e){ alert("Reveal failed: "+(e.message||e)); }
      });
    }
    if (rev) rev.disabled = !Game.canReveal;

    const myTurn = String(myPid) === String(Game.activeId);
    ["#kbBtn","#micBtn","#sendBtn","#answerInput"].forEach(sel=>{
      const el=root.querySelector(sel); if (el) el.disabled = !myTurn;
    });
  }

  async function pollAndUpdate(root){
    try{
      const st = await msApi.getState({ code: Game.code });
      reflectState(root, st);
      setTimerUI(root);
    }catch(e){ console.warn("poll error", e); }
  }

  function setupMic(root){
    const micBtn = root.querySelector("#micBtn");
    const voiceBar = root.querySelector("#voiceBar");
    const stopRec = root.querySelector("#stopRec");
    let stream=null, ctx=null, rafId=null;
    async function start(){
      try{
        stream = await navigator.mediaDevices.getUserMedia({audio:true});
        voiceBar.hidden=false; voiceBar.classList.add("on");
        ctx = new (window.AudioContext||window.webkitAudioContext)();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser(); an.fftSize=256; src.connect(an);
        const bars = voiceBar.querySelectorAll(".bars i"); const data = new Uint8Array(an.frequencyBinCount);
        (function tick(){ an.getByteFrequencyData(data);
          const avg = data.reduce((a,b)=>a+b,0)/data.length;
          bars.forEach((b,i)=> b.style.height = (10 + (avg/255)*30*(1+i/8))+"px");
          rafId = requestAnimationFrame(tick);
        })();
      }catch{ alert("Microphone permission denied or unavailable."); }
    }
    function stop(){
      voiceBar.classList.remove("on");
      if (rafId) cancelAnimationFrame(rafId);
      if (ctx) { ctx.close(); ctx=null; }
      if (stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
      voiceBar.hidden=true;
    }
    micBtn.addEventListener("click", start);
    stopRec.addEventListener("click", stop);
    return ()=>stop();
  }

  async function renderGame(root){
    document.body.classList.add("is-immersive");
    clearTimers();
    try{ await msApi.ensureConfig(); }catch{}
    setAuthNav();
    root.innerHTML=""; root.appendChild(tpl("tpl-game"));
    // dynamic seats layer
    const seats = document.createElement("div"); seats.className="seats";
    root.querySelector(".arena").appendChild(seats);

    Game.code = (location.hash.match(/#\/game\/([^?#]+)/)||[])[1] || "";
    // Textbox + submit
    const kbBtn=root.querySelector("#kbBtn");
    const textBox=root.querySelector("#textBox");
    const sendBtn=root.querySelector("#sendBtn");
    const ans=root.querySelector("#answerInput");
    kbBtn.addEventListener("click", ()=>{ textBox.hidden=false; });
    sendBtn.addEventListener("click", async ()=>{
      try{
        const st = await msApi.getState({ code: Game.code });
        const pid = msApi.getDevicePid(Game.code);
        await msApi.submitAnswer({ game_id: st.id, code: Game.code, participant_id: pid, text: ans.value });
        ans.value="";
      }catch(e){ alert("Send failed: "+(e.message||e)); }
    });

    const cleanupMic = setupMic(root);

    byId("endBtn",root).addEventListener("click", async ()=>{
      try{
        const st = await msApi.getState({ code: Game.code });
        await msApi.endGameAndAnalyze(st.id);
        // Wait for summary status
        const start = Date.now();
        let ok=false;
        while(Date.now()-start < 20000){
          const s2 = await msApi.getState({ code: Game.code });
          if (s2?.status === "summary"){ ok=true; break; }
          await new Promise(r=>setTimeout(r,800));
        }
        if (!ok){ alert("Analysis in progress. Try again in a moment."); return; }
        const frag = tpl("tpl-summary"); root.innerHTML=""; document.body.classList.remove("is-immersive"); root.appendChild(frag);
        root.querySelector("#getReport")?.addEventListener("click", async ()=>{
          try{ await msApi.emailFullReport(); alert("Full report sent by email"); }catch(e){ alert(e.message||e); }
        });
      }catch(e){ alert("End failed: "+(e.message||e)); }
    });

    byId("extendBtn",root).addEventListener("click", ()=>{
      if (byId("extendBtn",root).disabled) return;
      alert("Extend flow simulated (Stripe later).");
    });

    // Initial state + timers
    try{
      const st = await msApi.getState({ code: Game.code });
      reflectState(root, st);
      setTimerUI(root);
      Game.tick = setInterval(()=>setTimerUI(root), 1000);
    }catch(e){ console.warn(e); }

    Game.poll = setInterval(()=>pollAndUpdate(root), 2000);
    window.addEventListener("resize", ()=>placeSeats(seats, Game.participants, Game.activeId, Game.hostId));
    window.addEventListener("hashchange", ()=>{ clearTimers(); cleanupMic(); }, { once:true });
  }
  msRouter.add("#/game", renderGame);

  // Start router
  msRouter.start();
})();
