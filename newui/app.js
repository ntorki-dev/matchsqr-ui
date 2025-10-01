
/* === SURGICAL PATCH v2 for /newui/app.js ===
   - Fixes Game ID not showing in Host Lobby
   - Makes Start button robust even if code was only in URL
   - Keeps all previous mappings/logic intact
*/
(function(){
  const tpl = (id)=>document.getElementById(id)?.content?.cloneNode(true);

  // Helpers
  function initialsOf(name){
    if (!name) return "";
    return name.split(/\s+/).map(s=>s[0]||"").join("").slice(0,2).toUpperCase();
  }
  function byId(id, root=document){ return root.getElementById(id); }
  function parseLobbyCodeFromHash(){
    // supports "#/host/lobby/ABC123" plus trailing query/hash
    const h = location.hash || "";
    const m = h.match(/#\/host\/lobby\/([^?#]+)/i);
    return m ? decodeURIComponent(m[1]) : "";
  }
  function setAuthNav(){
    const login = document.getElementById("navLogin");
    const acc = document.getElementById("navAccount");
    const email = window.msApi?.getUserEmail?.() || null;
    if (!login || !acc) return;
    if (email){
      login.classList.add("hidden");
      acc.classList.remove("hidden");
      acc.title = email;
    } else {
      login.classList.remove("hidden");
      acc.classList.add("hidden");
      acc.title = "";
    }
  }
  function setGameCodeInDom(root, code){
    const sels = ['#lobbyId','#gameId','#code','.game-code','.js-game-code','[data-game-code]'];
    const nodes = sels.flatMap(sel => Array.from(root.querySelectorAll(sel)));
    nodes.forEach(n => {
      if (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA') n.value = code;
      else n.textContent = code;
    });
  }

  // Home
  msRouter.add("#/", async (root)=>{
    root.innerHTML = "";
    root.appendChild(tpl("tpl-home"));
    try { await msApi.ensureConfig(); } catch(e){ console.warn("Config error:", e); }
    setAuthNav();
    root.querySelector("#homeHostBtn").addEventListener("click", async (ev)=>{
      ev.preventDefault();
      try{
        if (!msApi.getUserEmail()){ location.hash = "#/login?return=host"; return; }
        const out = await msApi.createGame();
        if (out && out.participant_id) msApi.setDevicePid(out.code, out.participant_id);
        location.hash = "#/host/lobby/" + out.code;
      }catch(e){
        alert("Could not create a game. Please login first.");
        location.hash = "#/login?return=host";
      }
    });
  });

  // Host lobby (keep normal header)
  async function renderHostLobby(root, codeFromRouter){
    document.body.classList.remove("is-immersive");
    try { await msApi.ensureConfig(); } catch(e){ console.warn("Config error:", e); }
    setAuthNav();
    root.innerHTML = "";
    root.appendChild(tpl("tpl-host-lobby"));

    // Robust code detection & binding
    const code = codeFromRouter || parseLobbyCodeFromHash();
    if (!code) console.warn("No lobby code detected in router; parsed:", code);
    setGameCodeInDom(root, code);

    // Copy button
    const copyBtn = root.querySelector("#copyId, [data-copy='code']");
    if (copyBtn){
      copyBtn.addEventListener("click", async ()=>{
        try{ await navigator.clipboard.writeText(code); alert("Copied Game ID"); }catch{}
      });
    }

    // Start button
    root.querySelector("#startBtn")?.addEventListener("click", async ()=>{
      try{
        if (!code){ alert("Missing Game ID. Please go back and create a new game."); return; }
        const st = await msApi.getState({ code });
        if (!st || !st.id){ alert("Game not found or expired. Create a new game from the homepage."); return; }
        await msApi.startGame(st.id);
        location.hash = "#/game/" + code;
      }catch(e){ alert("Start failed: " + (e.message || e)); }
    });
  }

  // Join
  msRouter.add("#/join", async (root)=>{
    document.body.classList.remove("is-immersive");
    try { await msApi.ensureConfig(); } catch(e){ console.warn("Config error:", e); }
    setAuthNav();
    root.innerHTML = "";
    root.appendChild(tpl("tpl-join"));
    root.querySelector("#joinBtn").addEventListener("click", async ()=>{
      try{
        const name = root.querySelector("#joinName").value.trim();
        const code = root.querySelector("#joinCode").value.trim();
        if (!code) return alert("Enter Game ID");
        await msApi.joinGameGuest(code, name || null);
        location.hash = "#/game/" + code;
      }catch(e){ alert("Join failed: " + (e.message || e)); }
    });
  });

  // Register
  msRouter.add("#/register", async (root)=>{
    document.body.classList.remove("is-immersive");
    try { await msApi.ensureConfig(); } catch(e){ console.warn("Config error:", e); }
    setAuthNav();
    root.innerHTML = "";
    root.appendChild(tpl("tpl-register"));
    root.querySelector("#regBtn").addEventListener("click", async ()=>{
      const email = root.querySelector("#regEmail").value.trim();
      const pass = root.querySelector("#regPassword").value;
      const msg = root.querySelector("#regMsg");
      try{
        await msApi.register(email, pass);
        msg.textContent = "Check your email to confirm, then login.";
      }catch(e){ msg.textContent = e.message || String(e); }
    });
  });

  // Login
  msRouter.add("#/login", async (root, params)=>{
    document.body.classList.remove("is-immersive");
    try { await msApi.ensureConfig(); } catch(e){ console.warn("Config error:", e); }
    setAuthNav();
    root.innerHTML = "";
    root.appendChild(tpl("tpl-login"));
    root.querySelector("#loginBtn").addEventListener("click", async ()=>{
      const email = root.querySelector("#loginEmail").value.trim();
      const pass = root.querySelector("#loginPassword").value;
      const remember = root.querySelector("#rememberMe").checked;
      const msg = root.querySelector("#loginMsg");
      msg.textContent = "";
      try{
        await msApi.login(email, pass, remember);
        setAuthNav();
        if (params.get("return")==="host"){
          const out = await msApi.createGame();
          if (out && out.participant_id) msApi.setDevicePid(out.code, out.participant_id);
          location.hash = "#/host/lobby/" + out.code;
        } else {
          location.hash = "#/";
        }
      }catch(e){ msg.textContent = e.message || String(e); }
    });
  });

  // Account
  msRouter.add("#/account", async (root)=>{
    document.body.classList.remove("is-immersive");
    try { await msApi.ensureConfig(); } catch(e){ console.warn("Config error:", e); }
    setAuthNav();
    const email = msApi.getUserEmail();
    root.innerHTML = "";
    const wrap = document.createElement("section");
    wrap.className = "pad";
    if (email){
      wrap.innerHTML = `<h1>Account</h1>
        <p class="muted">Signed in as <b>${email}</b></p>
        <div style="margin-top:8px">
          <button id="logoutBtn" class="btn">Logout</button>
        </div>`;
      root.appendChild(wrap);
      wrap.querySelector("#logoutBtn").addEventListener("click", async ()=>{
        await msApi.logout();
        setAuthNav();
        location.hash = "#/";
      });
    } else {
      wrap.innerHTML = `<h1>Account</h1>
        <p class="muted">You are not logged in.</p>
        <a class="btn btn--green" href="#/login">Login</a>`;
      root.appendChild(wrap);
    }
  });

  // === GAME (unchanged from prior patch) ===
  const Game = {
    code: null,
    gameId: null,
    endsAt: null,
    pollHandle: null,
    tickHandle: null,
    participants: [],
    activeId: null,
    hostId: null,
    canReveal: false,
    question: null
  };

  function clearTimers(){
    if (Game.pollHandle) { clearInterval(Game.pollHandle); Game.pollHandle=null; }
    if (Game.tickHandle) { clearInterval(Game.tickHandle); Game.tickHandle=null; }
  }

  function placeSeats(container, list, activeId, hostId){
    container.innerHTML = "";
    const N = Math.max(1, list.length);
    const center = { x: container.clientWidth/2, y: container.clientHeight/2 };
    const R = Math.min(center.x, center.y) * 0.75;
    const startAngle = -Math.PI/2;
    list.forEach((p, idx)=>{
      const angle = startAngle + (idx * (2*Math.PI/N));
      const x = center.x + R * Math.cos(angle);
      const y = center.y + R * Math.sin(angle);
      const seat = document.createElement("div");
      seat.className = "seat" + (String(p.id)===String(hostId)?" host":"") + (String(p.id)===String(activeId)?" active":"");
      seat.style.transform = `translate(${Math.round(x-32)}px, ${Math.round(y-32)}px)`;
      const badge = document.createElement("div");
      badge.className = "badge"; badge.textContent = (p.initials || (p.name? p.name.split(/\s+/).map(s=>s[0]).join("").toUpperCase().slice(0,2):""));
      const name = document.createElement("div"); name.className = "name"; name.textContent = p.name || "";
      seat.appendChild(badge);
      if (String(p.id)===String(hostId)){ const crown = document.createElement("div"); crown.className="crown"; crown.textContent="👑"; seat.appendChild(crown); }
      seat.appendChild(name);
      container.appendChild(seat);
    });
  }

  function setTimerUI(root){
    const timeEl = byId("timeLeft", root);
    const ext = byId("extendBtn", root);
    if (!timeEl || !Game.endsAt) { if (timeEl) timeEl.textContent="--:--"; if (ext) ext.disabled = true; return; }
    const leftMs = new Date(Game.endsAt).getTime() - Date.now();
    const m = Math.max(0, Math.floor(leftMs/60000));
    const s = Math.max(0, Math.floor((leftMs%60000)/1000));
    if (timeEl) timeEl.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}m`;
    if (ext) ext.disabled = m > 10;
  }

  function mapStateToUI(root, st){
    Game.gameId = st.id || Game.gameId;
    Game.endsAt = st.ends_at || Game.endsAt;
    Game.participants = st.participants || Game.participants;
    Game.canReveal = !!(st.can_reveal);
    Game.activeId = st.active_participant_id
      || (st.current_turn && (st.current_turn.participant_id || st.current_turn.id))
      || Game.activeId;
    Game.hostId = st.host_participant_id
      || (Array.isArray(Game.participants) ? (Game.participants.find(p=>p.role==="host" || p.is_host)?.id) : null)
      || Game.hostId;
    Game.question = st.question || st.card || Game.question;

    const seatsWrap = root.querySelector(".seats");
    if (seatsWrap) placeSeats(seatsWrap, Game.participants, Game.activeId, Game.hostId);

    const qEl = root.querySelector(".card__text");
    if (qEl && Game.question) qEl.innerHTML = (Game.question.text || "").replace(/\n/g,"<br/>");

    const level = (Game.question && Game.question.level) || "icebreaker";
    root.querySelectorAll('.levels input[name="lvl"]').forEach((inp, idx)=>{
      const map = {0:"icebreaker",1:"get_to_know_you",2:"real_you"};
      inp.checked = (map[idx]===level || (idx===0 && level==="simple") || (idx===1 && level==="medium") || (idx===2 && level==="deep"));
    });

    let rev = root.querySelector("#revealBtnDyn");
    const myPid = msApi.getDevicePid(Game.code);
    const iAmHost = String(Game.hostId) === String(myPid);
    if (Game.canReveal && iAmHost){
      if (!rev){
        rev = document.createElement("button");
        rev.id = "revealBtnDyn";
        rev.className = "btn";
        rev.textContent = "Reveal next card";
        root.querySelector(".game-top .actions")?.prepend(rev);
        rev.addEventListener("click", async ()=>{
          try{ await msApi.revealNext(Game.code, Game.gameId); }catch(e){ alert("Reveal failed: "+(e.message||e)); }
        });
      }
      rev.disabled = false;
    }else if (rev){
      rev.disabled = true;
    }

    const myTurn = String(myPid) === String(Game.activeId);
    const kbTile = root.querySelector("#kbBtn");
    const micTile = root.querySelector("#micBtn");
    const sendBtn = root.querySelector("#sendBtn");
    const ans = root.querySelector("#answerInput");
    [kbTile, micTile, sendBtn, ans].forEach(el=>{ if(!el) return; el.disabled = !myTurn; });
  }

  async function pollAndUpdate(root){
    try{
      const st = await msApi.getState({ code: Game.code });
      mapStateToUI(root, st);
      setTimerUI(root);
    }catch(e){ console.warn("poll error", e); }
  }

  function setupMic(root){
    const micBtn = root.querySelector("#micBtn");
    const voiceBar = root.querySelector("#voiceBar");
    const stopRec = root.querySelector("#stopRec");
    let mediaStream = null;
    let audioCtx = null;
    let rafId = null;

    async function start(){
      try{
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceBar.classList.add("on");
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = audioCtx.createMediaStreamSource(mediaStream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const bars = voiceBar.querySelectorAll(".bars i");
        const data = new Uint8Array(analyser.frequencyBinCount);
        (function tick(){
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a,b)=>a+b,0)/data.length;
          bars.forEach((b,i)=>{ b.style.height = (10 + (avg/255)*30 * (1+i/8)) + "px"; });
          rafId = requestAnimationFrame(tick);
        })();
      }catch(err){
        alert("Microphone not available. Check permissions.");
      }
    }
    function stop(){
      voiceBar.classList.remove("on");
      if (rafId) cancelAnimationFrame(rafId);
      if (audioCtx) { audioCtx.close(); audioCtx=null; }
      if (mediaStream){ mediaStream.getTracks().forEach(t=>t.stop()); mediaStream=null; }
    }

    micBtn.addEventListener("click", ()=>{ voiceBar.hidden = false; start(); });
    stopRec.addEventListener("click", ()=>{ stop(); voiceBar.hidden = true; });
    return ()=>stop();
  }

  async function renderGame(root, code){
    document.body.classList.add("is-immersive");
    clearTimers();
    try { await msApi.ensureConfig(); } catch(e){ console.warn("Config error:", e); }
    setAuthNav();
    root.innerHTML = "";
    root.appendChild(tpl("tpl-game"));
    Game.code = code;

    const seatsWrap = document.createElement("div");
    seatsWrap.className = "seats";
    root.querySelector(".arena").appendChild(seatsWrap);

    const kbBtn = root.querySelector("#kbBtn");
    const textBox = root.querySelector("#textBox");
    const sendBtn = root.querySelector("#sendBtn");
    const ans = root.querySelector("#answerInput");
    kbBtn.addEventListener("click", ()=>{ textBox.hidden = false; });
    sendBtn.addEventListener("click", async ()=>{
      try{
        const st = await msApi.getState({ code: Game.code });
        const pid = msApi.getDevicePid(Game.code);
        const payload = { game_id: st.id, code: Game.code, participant_id: pid, text: ans.value };
        await msApi.submitAnswer(payload);
        ans.value = "";
      }catch(e){ alert("Send failed: "+(e.message||e)); }
    });

    const cleanupMic = setupMic(root);

    byId("endBtn",root).addEventListener("click", async ()=>{
      try{
        const st = await msApi.getState({ code: Game.code });
        await msApi.endGameAndAnalyze(st.id);
        const frag = tpl("tpl-summary");
        root.innerHTML = ""; document.body.classList.remove("is-immersive");
        root.appendChild(frag);
        root.querySelector("#getReport")?.addEventListener("click", async ()=>{
          try{ await msApi.emailFullReport(); alert("Full report sent by email"); }catch(e){ alert(e.message||e); }
        });
      }catch(e){ alert("End failed: "+(e.message||e)); }
    });

    byId("extendBtn",root).addEventListener("click", ()=>{
      if (byId("extendBtn",root).disabled) return;
      alert("Extend flow simulated (Stripe later).");
    });

    try{
      const st = await msApi.getState({ code: Game.code });
      mapStateToUI(root, st);
      setTimerUI(root);
      Game.tickHandle = setInterval(()=>setTimerUI(root), 1000);
    }catch(e){ console.warn(e); }

    Game.pollHandle = setInterval(()=>pollAndUpdate(root), 2000);
    window.addEventListener("hashchange", ()=>{ clearTimers(); cleanupMic(); }, { once:true });
  }

  window.msScreens = { renderHostLobby, renderGame };
})();
