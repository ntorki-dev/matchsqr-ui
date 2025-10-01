
(function(){
  const tpl = (id)=>document.getElementById(id).content.cloneNode(true);

  function setAuthNav(){
    const login = document.getElementById("navLogin");
    const acc = document.getElementById("navAccount");
    const email = msApi.getUserEmail();
    if (email){
      login.classList.add("hidden");
      acc.classList.remove("hidden");
      acc.title = email;
    }else{
      login.classList.remove("hidden");
      acc.classList.add("hidden");
    }
  }

  // Home
  msRouter.add("#/", async (root)=>{
    root.innerHTML = "";
    root.appendChild(tpl("tpl-home"));
    await msApi.ensureConfig();
    setAuthNav();
    root.querySelector("#homeHostBtn").addEventListener("click", async ()=>{
      try{
        if (!msApi.getUserEmail()){ location.hash = "#/login?return=host"; return; }
        const out = await msApi.createGame();
        location.hash = "#/host/lobby/"+out.code;
      }catch(e){ alert("Host failed. Please login first."); location.hash = "#/login?return=host"; }
    });
  });

  // Host lobby
  async function renderHostLobby(root, code){
    await msApi.ensureConfig();
    setAuthNav();
    root.innerHTML = "";
    root.appendChild(tpl("tpl-host-lobby"));
    const idEl = root.querySelector("#lobbyId");
    idEl.textContent = code;
    root.querySelector("#copyId").addEventListener("click", async ()=>{
      await navigator.clipboard.writeText(code);
      alert("Copied Game ID");
    });
    root.querySelector("#startBtn").addEventListener("click", async ()=>{
      try{
        const st = await msApi.getState({ code });
        await msApi.startGame(st.id);
        location.hash = "#/game/"+code;
      }catch(e){ alert("Start failed: " + (e.message||e)); }
    });
  }

  // Join
  msRouter.add("#/join", async (root)=>{
    await msApi.ensureConfig();
    setAuthNav();
    root.innerHTML = "";
    root.appendChild(tpl("tpl-join"));
    root.querySelector("#joinBtn").addEventListener("click", async ()=>{
      try{
        const name = root.querySelector("#joinName").value.trim();
        const code = root.querySelector("#joinCode").value.trim();
        if (!code) return alert("Enter Game ID");
        await msApi.joinGameGuest(code, name||null);
        location.hash = "#/game/"+code;
      }catch(e){ alert("Join failed: " + (e.message||e)); }
    });
  });

  // Register
  msRouter.add("#/register", async (root)=>{
    await msApi.ensureConfig();
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
    await msApi.ensureConfig();
    setAuthNav();
    root.innerHTML = "";
    root.appendChild(tpl("tpl-login"));
    root.querySelector("#loginBtn").addEventListener("click", async ()=>{
      const email = root.querySelector("#loginEmail").value.trim();
      const pass = root.querySelector("#loginPassword").value;
      const remember = root.querySelector("#rememberMe").checked;
      const msg = root.querySelector("#loginMsg");
      try{
        await msApi.login(email, pass, remember);
        setAuthNav();
        if (params.get("return")==="host"){
          const out = await msApi.createGame();
          location.hash = "#/host/lobby/"+out.code;
        }else{
          location.hash = "#/";
        }
      }catch(e){ msg.textContent = e.message || String(e); }
    });
  });

  // Game
  async function renderGame(root, code){
    await msApi.ensureConfig();
    setAuthNav();
    root.innerHTML = "";
    root.appendChild(tpl("tpl-game"));

    // timers and gating
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
      timeEl.textContent = (m<10? "0"+m : m) + ":59m";
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

    ext.addEventListener("click", ()=>{ alert("Extend flow simulated. Stripe later."); });
    end.addEventListener("click", async ()=>{
      try{
        const st = await msApi.getState({ code });
        await msApi.endGameAndAnalyze(st.id);
        root.innerHTML = "";
        root.appendChild(tpl("tpl-summary"));
        root.querySelector("#getReport").addEventListener("click", async ()=>{
          try{ await msApi.emailFullReport(); alert("Full report sent by email"); }catch(e){ alert(e.message||e); }
        });
      }catch(e){ alert("End failed: "+(e.message||e)); }
    });
  }

  window.msScreens = { renderHostLobby, renderGame };
})();
