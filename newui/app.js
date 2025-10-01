/* === SURGICAL PATCH v3 for /newui/app.js ===
   Maps your existing behavior into the new UI.

   Fixes:
   - Lobby shows Game ID (regardless of selector name) and Start works.
   - Timer uses ends_at OR time_left fields and ticks every second.
   - Extend strictly disabled until T-10 (UI + pointer-events).
   - Seats placed around center; recalculated on resize (no crowding).
   - Guest join reflected via polling (participants / players / members).
   - Reveal button always visible for host (disabled until allowed).
   - Gating: only active player can type/talk/submit.
   - End game: calls analysis and polls until summary before swapping screen.
*/

(function () {
  const tpl = (id) => document.getElementById(id)?.content?.cloneNode(true);
  const byId = (id, root = document) => root.getElementById(id);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  // ---------- Header auth state ----------
  function setAuthNav() {
    const login = document.getElementById("navLogin");
    const acc = document.getElementById("navAccount");
    const email = window.msApi?.getUserEmail?.() || null;
    if (!login || !acc) return;
    if (email) { login.classList.add("hidden"); acc.classList.remove("hidden"); acc.title = email; }
    else { login.classList.remove("hidden"); acc.classList.add("hidden"); acc.title = ""; }
  }

  // ---------- Home ----------
  msRouter.add("#/", async (root) => {
    root.innerHTML = ""; root.appendChild(tpl("tpl-home"));
    try { await msApi.ensureConfig(); } catch {}
    setAuthNav();

    root.querySelector("#homeHostBtn").addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        if (!msApi.getUserEmail()) { location.hash = "#/login?return=host"; return; }
        const out = await msApi.createGame();
        if (out?.participant_id) msApi.setDevicePid(out.code, out.participant_id); // host pid for gating
        location.hash = "#/host/lobby/" + out.code;
      } catch {
        alert("Could not create a game. Please login first.");
        location.hash = "#/login?return=host";
      }
    });
  });

  // ---------- Lobby ----------
  function parseLobbyCodeFromHash() {
    const m = (location.hash || "").match(/#\/host\/lobby\/([^?#]+)/i);
    return m ? decodeURIComponent(m[1]) : "";
  }
  function bindGameCode(root, code) {
    ['#lobbyId','#gameId','#code','.game-code','.js-game-code','[data-game-code]']
      .flatMap(sel => Array.from(root.querySelectorAll(sel)))
      .forEach(n => { if (!n) return; (n.tagName === "INPUT" ? n.value = code : n.textContent = code); });
  }
  async function renderHostLobby(root, codeFromRouter) {
    document.body.classList.remove("is-immersive");
    try { await msApi.ensureConfig(); } catch {}
    setAuthNav();
    root.innerHTML = ""; root.appendChild(tpl("tpl-host-lobby"));

    const code = codeFromRouter || parseLobbyCodeFromHash();
    bindGameCode(root, code);

    root.querySelector("#copyId, [data-copy='code']")?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(code); alert("Copied Game ID"); } catch {}
    });

    root.querySelector("#startBtn")?.addEventListener("click", async () => {
      try {
        const st = await msApi.getState({ code });
        if (!st?.id) throw new Error("Game not found or expired.");
        await msApi.startGame(st.id);
        location.hash = "#/game/" + code;
      } catch (e) { alert("Start failed: " + (e.message || e)); }
    });
  }

  // ---------- Join / Login / Register ----------
  msRouter.add("#/join", async (root) => {
    document.body.classList.remove("is-immersive");
    try { await msApi.ensureConfig(); } catch {}
    setAuthNav();
    root.innerHTML = ""; root.appendChild(tpl("tpl-join"));
    root.querySelector("#joinBtn").addEventListener("click", async () => {
      try {
        const name = root.querySelector("#joinName").value.trim();
        const code = root.querySelector("#joinCode").value.trim();
        if (!code) return alert("Enter Game ID");
        await msApi.joinGameGuest(code, name || null);
        location.hash = "#/game/" + code;
      } catch (e) { alert("Join failed: " + (e.message || e)); }
    });
  });

  msRouter.add("#/login", async (root, params) => {
    document.body.classList.remove("is-immersive");
    try { await msApi.ensureConfig(); } catch {}
    setAuthNav();
    root.innerHTML = ""; root.appendChild(tpl("tpl-login"));
    root.querySelector("#loginBtn").addEventListener("click", async () => {
      const email = root.querySelector("#loginEmail").value.trim();
      const pass = root.querySelector("#loginPassword").value;
      const remember = root.querySelector("#rememberMe").checked;
      const msg = root.querySelector("#loginMsg"); msg.textContent = "";
      try {
        await msApi.login(email, pass, remember);
        setAuthNav();
        if (params.get("return") === "host") {
          const out = await msApi.createGame();
          if (out?.participant_id) msApi.setDevicePid(out.code, out.participant_id);
          location.hash = "#/host/lobby/" + out.code;
        } else { location.hash = "#/"; }
      } catch (e) { msg.textContent = e.message || String(e); }
    });
  });

  msRouter.add("#/register", async (root) => {
    document.body.classList.remove("is-immersive");
    try { await msApi.ensureConfig(); } catch {}
    setAuthNav();
    root.innerHTML = ""; root.appendChild(tpl("tpl-register"));
    root.querySelector("#regBtn").addEventListener("click", async () => {
      const email = root.querySelector("#regEmail").value.trim();
      const pass = root.querySelector("#regPassword").value;
      const msg = root.querySelector("#regMsg");
      try { await msApi.register(email, pass); msg.textContent = "Check your email to confirm, then login."; }
      catch (e) { msg.textContent = e.message || String(e); }
    });
  });

  msRouter.add("#/account", async (root) => {
    document.body.classList.remove("is-immersive");
    try { await msApi.ensureConfig(); } catch {}
    setAuthNav();
    const email = msApi.getUserEmail();
    root.innerHTML = "";
    const wrap = document.createElement("section"); wrap.className = "pad";
    if (email) {
      wrap.innerHTML = `<h1>Account</h1><p class="muted">Signed in as <b>${email}</b></p><div style="margin-top:8px"><button id="logoutBtn" class="btn">Logout</button></div>`;
      root.appendChild(wrap);
      wrap.querySelector("#logoutBtn").addEventListener("click", async () => {
        await msApi.logout(); setAuthNav(); location.hash = "#/";
      });
    } else {
      wrap.innerHTML = `<h1>Account</h1><p class="muted">You are not logged in.</p><a class="btn btn--green" href="#/login">Login</a>`;
      root.appendChild(wrap);
    }
  });

  // ---------- Game ----------
  const Game = { code:null, gameId:null, endsAt:null, pollHandle:null, tickHandle:null,
                 participants:[], activeId:null, hostId:null, canReveal:false, question:null };

  function clearTimers(){ if (Game.pollHandle) clearInterval(Game.pollHandle), Game.pollHandle=null;
                          if (Game.tickHandle) clearInterval(Game.tickHandle), Game.tickHandle=null; }

  function computeEndsAtFromState(st){
    if (st?.ends_at) return st.ends_at;
    const left = st?.time_left_ms ?? st?.time_remaining_ms ?? (st?.seconds_left ? st.seconds_left*1000 : null);
    return left!=null ? new Date(Date.now()+Number(left)).toISOString() : null;
  }

  function placeSeats(container, list, activeId, hostId){
    if (!container) return;
    container.innerHTML = "";
    const r = container.getBoundingClientRect();
    const cx = r.width/2, cy = r.height/2;
    const R = Math.max(120, Math.min(cx, cy) - 120);
    const start = -Math.PI/2;
    const N = Math.max(1, list.length);
    list.forEach((p,i)=>{
      const a = start + i*(2*Math.PI/N);
      const x = cx + R*Math.cos(a), y = cy + R*Math.sin(a);
      const seat = document.createElement("div");
      seat.className = "seat" + (String(p.id)===String(hostId)?" host":"") + (String(p.id)===String(activeId)?" active":"");
      seat.style.left = clamp(x-32, 8, r.width-72) + "px";
      seat.style.top  = clamp(y-32, 8, r.height-96) + "px";
      const initials = (p.initials || (p.name||"").split(/\s+/).map(s=>s[0]).join("").toUpperCase().slice(0,2));
      seat.innerHTML = `<div class="badge">${initials}</div>${String(p.id)===String(hostId)?'<div class="crown">👑</div>':''}<div class="name">${p.name||""}</div>`;
      container.appendChild(seat);
    });
  }

  function setTimerUI(root){
    const timeEl = byId("timeLeft", root);
    const ext = byId("extendBtn", root);
    if (!timeEl){ return; }
    if (!Game.endsAt){ timeEl.textContent="--:--"; if (ext) ext.disabled=true; return; }
    const leftMs = new Date(Game.endsAt).getTime() - Date.now();
    const m = Math.max(0, Math.floor(leftMs/60000));
    const s = Math.max(0, Math.floor((leftMs%60000)/1000));
    timeEl.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}m`;
    if (ext) ext.disabled = m > 10; // keep strictly disabled > T-10
  }

  function mapStateToUI(root, st){
    if (window.__MS_DEBUG) console.log("state", st);

    Game.gameId = st.id ?? Game.gameId;
    Game.endsAt = computeEndsAtFromState(st) ?? Game.endsAt;
    Game.participants = st.participants || st.players || st.members || Game.participants;
    Game.canReveal = !!(st.can_reveal || st.next_available || st.canNext || st.allow_next);
    Game.activeId = st.active_participant_id || (st.current_turn && (st.current_turn.participant_id || st.current_turn.id)) || Game.activeId;
    Game.hostId = st.host_participant_id || (Array.isArray(Game.participants)? (Game.participants.find(p=>p.role==="host"||p.is_host)?.id):null) || Game.hostId;
    Game.question = st.question || st.card || Game.question;

    // Seats & question
    placeSeats(root.querySelector(".seats"), Game.participants, Game.activeId, Game.hostId);
    const qEl = root.querySelector(".card__text");
    if (qEl && Game.question) qEl.innerHTML = (Game.question.text||"").replace(/\n/g,"<br/>");

    // Level radios reflect level (read-only)
    const level = (Game.question && Game.question.level) || "icebreaker";
    root.querySelectorAll('.levels input[name="lvl"]').forEach((inp, idx)=>{
      const map = {0:"icebreaker",1:"get_to_know_you",2:"real_you"};
      inp.checked = (map[idx]===level || (idx===0 && level==="simple") || (idx===1 && level==="medium") || (idx===2 && level==="deep"));
    });

    // Reveal button: always visible for host; disabled until allowed
    const myPid = msApi.getDevicePid(Game.code);
    const iAmHost = String(Game.hostId) === String(myPid);
    let rev = root.querySelector("#revealBtnDyn");
    if (iAmHost && !rev){
      rev = document.createElement("button");
      rev.id = "revealBtnDyn"; rev.className="btn"; rev.textContent="Reveal next card";
      root.querySelector(".game-top .actions")?.prepend(rev);
      rev.addEventListener("click", async ()=>{ try{ await msApi.revealNext(Game.code, Game.gameId); }catch(e){ alert("Reveal failed: "+(e.message||e)); } });
    }
    if (rev) rev.disabled = !Game.canReveal;

    // Gating: only active player can type/talk/submit
    const myTurn = String(myPid) === String(Game.activeId);
    ["#kbBtn","#micBtn","#sendBtn","#answerInput"].forEach(sel=>{
      const el=root.querySelector(sel); if (el) el.disabled = !myTurn;
    });
  }

  async function pollAndUpdate(root){
    try{
      const st = await msApi.getState({ code: Game.code });
      mapStateToUI(root, st);
      setTimerUI(root);
    }catch(e){ console.warn("poll error", e); }
  }

  // Mic – animate bars only while recording
  function setupMic(root){
    const micBtn=root.querySelector("#micBtn");
    const voiceBar=root.querySelector("#voiceBar");
    const stopRec=root.querySelector("#stopRec");
    let mediaStream=null, audioCtx=null, rafId=null;

    async function start(){
      try{
        mediaStream = await navigator.mediaDevices.getUserMedia({audio:true});
        voiceBar.classList.add("on");
        audioCtx = new (window.AudioContext||window.webkitAudioContext)();
        const src = audioCtx.createMediaStreamSource(mediaStream);
        const an = audioCtx.createAnalyser(); an.fftSize=256; src.connect(an);
        const bars = voiceBar.querySelectorAll(".bars i"); const data = new Uint8Array(an.frequencyBinCount);
        (function tick(){ an.getByteFrequencyData(data);
          const avg = data.reduce((a,b)=>a+b,0)/data.length;
          bars.forEach((b,i)=> b.style.height = (10 + (avg/255)*30*(1+i/8))+"px");
          rafId = requestAnimationFrame(tick);
        })();
      }catch{ alert("Microphone not available. Check permissions."); }
    }
    function stop(){
      voiceBar.classList.remove("on");
      if (rafId) cancelAnimationFrame(rafId);
      if (audioCtx) { audioCtx.close(); audioCtx=null; }
      if (mediaStream){ mediaStream.getTracks().forEach(t=>t.stop()); mediaStream=null; }
    }

    micBtn.addEventListener("click", ()=>{ voiceBar.hidden=false; start(); });
    stopRec.addEventListener("click", ()=>{ stop(); voiceBar.hidden=true; });
    return ()=>stop();
  }

  // Render Game
  async function renderGame(root, code){
    document.body.classList.add("is-immersive"); // hide white header ONLY on game
    clearTimers();
    try { await msApi.ensureConfig(); } catch {}
    setAuthNav();
    root.innerHTML = ""; root.appendChild(tpl("tpl-game"));
    Game.code = code;

    const seatsWrap = document.createElement("div"); seatsWrap.className="seats";
    root.querySelector(".arena").appendChild(seatsWrap);

    // Keyboard / Submit
    const kbBtn = root.querySelector("#kbBtn");
    const textBox = root.querySelector("#textBox");
    const sendBtn = root.querySelector("#sendBtn");
    const ans = root.querySelector("#answerInput");
    kbBtn.addEventListener("click", ()=>{ textBox.hidden=false; });
    sendBtn.addEventListener("click", async ()=>{
      try{
        const st = await msApi.getState({ code: Game.code });
        const pid = msApi.getDevicePid(Game.code);
        await msApi.submitAnswer({ game_id: st.id, code: Game.code, participant_id: pid, text: ans.value });
        ans.value="";
      }catch(e){ alert("Send failed: " + (e.message||e)); }
    });

    // Mic
    const cleanupMic = setupMic(root);

    // End game & analyze (wait for summary)
    byId("endBtn",root).addEventListener("click", async ()=>{
      try{
        const st = await msApi.getState({ code: Game.code });
        await msApi.endGameAndAnalyze(st.id);
        const start = Date.now(); let ready=false;
        while(Date.now()-start < 20000){
          const ns = await msApi.getState({ code: Game.code });
          if (ns?.status === "summary"){ ready=true; break; }
          await new Promise(r=>setTimeout(r, 800));
        }
        if (!ready){ alert("Analysis in progress. Try again in a few seconds."); return; }
        const frag = tpl("tpl-summary");
        root.innerHTML = ""; document.body.classList.remove("is-immersive");
        root.appendChild(frag);
        root.querySelector("#getReport")?.addEventListener("click", async ()=>{ try{ await msApi.emailFullReport(); alert("Full report sent by email"); }catch(e){ alert(e.message||e); }});
      }catch(e){ alert("End failed: " + (e.message||e)); }
    });

    // Extend (still simulated; UI guarded by timer)
    byId("extendBtn",root).addEventListener("click", ()=>{
      if (byId("extendBtn",root).disabled) return;
      alert("Extend flow simulated (Stripe later).");
    });

    // First state + timers + polling
    try{
      const st = await msApi.getState({ code: Game.code });
      mapStateToUI(root, st); setTimerUI(root);
      Game.tickHandle = setInterval(()=>setTimerUI(root), 1000);
    }catch(e){ console.warn(e); }

    Game.pollHandle = setInterval(()=>pollAndUpdate(root), 2000);
    window.addEventListener("resize", ()=>placeSeats(seatsWrap, Game.participants, Game.activeId, Game.hostId));
    window.addEventListener("hashchange", ()=>{ clearTimers(); cleanupMic(); }, { once:true });
  }

  window.msScreens = { renderHostLobby, renderGame };
})();
