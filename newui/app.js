(function(){
  const tpl = (id)=>document.getElementById(id)?.content?.cloneNode(true);

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
        location.hash = "#/host/lobby/" + out.code;
      }catch(e){
        alert("Could not create a game. Please login first.");
        location.hash = "#/login?return=host";
      }
    });
  });

  // Host lobby
  async function renderHostLobby(root, code){
    try { await msApi.ensureConfig(); } catch(e){ console.warn("Config error:", e); }
    setAuthNav();
    root.innerHTML = "";
    root.appendChild(tpl("tpl-host-lobby"));
    const idEl = root.querySelector("#lobbyId");
    if (idEl) idEl.textContent = code;
    root.querySelector("#copyId")?.addEventListener("click", async ()=>{
      try{ await navigator.clipboard.writeText(code); alert("Copied Game ID"); }catch{}
    });
    root.querySelector("#startBtn")?.addEventListener("click", async ()=>{
      try{
        const st = await msApi.getState({ code });
        await msApi.startGame(st.id);
        location.hash = "#/game/" + code;
      }catch(e){ alert("Start failed: " + (e.message || e)); }
    });
  }

  // Join
  msRouter.add("#/join", async (root)=>{
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
          location.hash = "#/host/lobby/" + out.code;
        } else {
          location.hash = "#/";
        }
      }catch(e){ msg.textContent = e.message || String(e); }
    });
  });

  // Account (added)
  msRouter.add("#/account", async (root)=>{
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

  // Game
  async function renderGame(root, code){
    try { await msApi.ensureConfig(); } catch(e){ console.warn("Config error:", e); }
    setAuthNav();
    root.innerHTML = "";
    root.appendChild(tpl("tpl-game"));

    const timeEl = root.querySelector("#timeLeft");
    const ext = root.querySelector("#extendBtn");
    const end = root.querySelector("#endBtn");
    const textBox = root.querySelector("#textBox");
    const voiceBar = root.querySelector("#voiceBar");
    const micBtn = root.querySelector("#micBtn");
    const kbBtn = root.querySelector("#kbBtn");
    const sendBtn = root.querySelector("#sendBtn");
    const ans = root.querySelector("#answerInput");

    function setTimer(ms){
      const m = Math.max(0, Math.floor(ms/60000));
      timeEl.textContent = (m < 10 ? "0"+m : m) + ":59m";
      ext.disabled = m > 10;
    }
    setTimer(59*60000);

    micBtn.addEventListener("click", ()=>{ voiceBar.hidden = false; textBox.hidden = true; });
    kbBtn.addEventListener("click", ()=>{ textBox.hidden = false; voiceBar.hidden = true; });
    root.querySelector("#stopRec").addEventListener("click", ()=>{ voiceBar.hidden = true; });

    sendBtn.addEventListener("click", async ()=>{
      try{
        const st = await msApi.getState({ code });
        const pid = msApi.getDevicePid(code);
        const payload = { game_id: st.id, code, participant_id: pid, text: ans.value };
        await msApi.submitAnswer(payload);
        ans.value = "";
      }catch(e){ alert("Send failed: "+(e.message||e)); }
    });

    ext.addEventListener("click", ()=>{ alert("Extend flow simulated (Stripe later)."); });
    end.addEventListener("click", async ()=>{
      try{
        const st = await msApi.getState({ code });
        await msApi.endGameAndAnalyze(st.id);
        // Render summary inline
        const frag = tpl("tpl-summary");
        root.innerHTML = "";
        root.appendChild(frag);
        root.querySelector("#getReport")?.addEventListener("click", async ()=>{
          try{ await msApi.emailFullReport(); alert("Full report sent by email"); }catch(e){ alert(e.message||e); }
        });
      }catch(e){ alert("End failed: "+(e.message||e)); }
    });
  }

  window.msScreens = { renderHostLobby, renderGame };
})();
