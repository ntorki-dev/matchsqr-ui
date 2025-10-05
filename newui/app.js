
/*! MatchSqr UI (ASCII-safe) — reuse-only client, fixed Create->Lobby flow, deep code extraction */
(function(){
  // ---------- utils ----------
  var $ = function(sel, root){ return (root||document).querySelector(sel); };
  function toast(msg, ms){ ms = ms||2200; var t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(function(){ t.remove(); }, ms); }
  function debug(obj){ var pre=$("#debug-pre"); if(!pre) return; var s=pre.textContent + "\n" + JSON.stringify(obj,null,2); pre.textContent=s.slice(-30000); }
  function setOfflineBanner(show){ var b=$(".offline-banner"); if(!b) return; if(show){ b.classList.add("show"); } else { b.classList.remove("show"); } }
  addEventListener("offline",function(){ setOfflineBanner(true); });
  addEventListener("online",function(){ setOfflineBanner(false); });

  // ---------- config ----------
  var CONFIG = window.CONFIG || {};
  var FUNCTIONS_BASE = String(CONFIG.FUNCTIONS_BASE||"").replace(/\/+$/,"");

  // ---------- Supabase client (REUSE ONLY) ----------
  function sbClient(){
    if (window.__MS_CLIENT && window.__MS_CLIENT.auth && window.__MS_CLIENT.functions) return window.__MS_CLIENT;
    if (window.supabaseClient && window.supabaseClient.auth && window.supabaseClient.functions) return window.supabaseClient;
    if (window.supabase && window.supabase.auth && window.supabase.functions) return window.supabase;
    if (window.SUPABASE && window.SUPABASE.auth && window.SUPABASE.functions) return window.SUPABASE;
    if (window.sb && window.sb.auth && window.sb.functions) return window.sb;
    throw new Error("[MS] Supabase client not found.");
  }
  async function getSession(){ var r = await sbClient().auth.getSession(); return (r&&r.data&&r.data.session)||null; }
  function authHeader(session){ var token=session&&session.access_token||""; return token?{Authorization:"Bearer "+token}:{ }; }

  // ---------- storage & code resolution ----------
  function storedRoom(){
    try{ return JSON.parse(localStorage.getItem("active_room") || sessionStorage.getItem("active_room") || "null") || {}; }catch(e){ return {}; }
  }
  function saveActiveRoom(obj){
    var code = extractCodeDeep(obj);
    var base = storedRoom()||{};
    var toSave = {};
    for (var k in base){ toSave[k]=base[k]; }
    for (var k2 in obj){ toSave[k2]=obj[k2]; }
    if (code){ toSave.game_code = code; toSave.code = code; }
    localStorage.setItem("active_room", JSON.stringify(toSave));
  }
  function resolveCode(explicit){
    if (explicit) return explicit;
    var m = (location.hash||"").match(/^#\/game\/([^?]+)/);
    if (m) return m[1];
    var ar = storedRoom();
    return extractCodeDeep(ar);
  }
  function pidKey(code){ return "ms_pid_"+code; }

  // ---------- deep code extraction ----------
  function extractCodeDeep(obj){
    if (!obj || typeof obj !== "object") return null;
    var queue = [{o:obj, depth:0}];
    var seen = [];
    var keyRe = /(game.*code|^code$|room.*id$|game.*id$|^id$)/i;
    while (queue.length){
      var item = queue.shift();
      var o = item.o, depth = item.depth;
      if (!o || typeof o!=="object" || seen.indexOf(o)>=0 || depth>5) continue;
      seen.push(o);
      for (var k in o){
        var v = o[k];
        if (keyRe.test(k) && (typeof v==="string" || typeof v==="number")){
          var s = String(v).trim();
          if (s) return s;
        }
        if (v && typeof v === "object"){ queue.push({o:v, depth:depth+1}); }
      }
    }
    return null;
  }

  // ---------- HTTP helpers (Edge Functions) ----------
  async function jpost(path, body){
    var session = await getSession();
    var res = await fetch(FUNCTIONS_BASE + "/" + path, {
      method:"POST",
      headers:(function(){ var h={"Content-Type":"application/json"}; var a=authHeader(session); for (var k in a){ h[k]=a[k]; } return h; })(),
      body: body ? JSON.stringify(body) : undefined
    });
    var text = await res.text();
    var json=null; try{ json=text?JSON.parse(text):null; }catch(e){}
    if(!res.ok){
      var e2=new Error((json&&(json.message||json.error))||text||"Request failed");
      e2.status=res.status; e2.data=json; throw e2;
    }
    return json;
  }
  async function jget(pathWithQuery){
    var session = await getSession();
    var res = await fetch(FUNCTIONS_BASE + "/" + pathWithQuery, { headers:(function(){ var h={}; var a=authHeader(session); for (var k in a){ h[k]=a[k]; } return h; })() });
    var text=await res.text();
    var json=null; try{ json=text?JSON.parse(text):null; }catch(e){}
    if(!res.ok){
      var e2=new Error((json&&(json.message||json.error))||text||"Request failed");
      e2.status=res.status; e2.data=json; throw e2;
    }
    return json;
  }

  // ---------- API (exact contracts) ----------
  var API = {
    create_game: function(){ return jpost("create_game", null); },
    get_state: function(p){ var code=resolveCode(p&&p.code); if(!code) throw new Error("Missing game id"); return jget("get_state?code="+encodeURIComponent(code)); },
    join_game_guest: function(p){
      var code=resolveCode(p&&p.code); if(!code) throw new Error("Missing game id");
      var nickname = (p&&p.nickname) || (p&&p.name) || "";
      var existingPid = localStorage.getItem(pidKey(code));
      var body = { code: code };
      if (existingPid) body.participant_id = JSON.parse(existingPid);
      if (nickname) body.nickname = nickname;
      return jpost("join_game_guest", body).then(function(data){
        var pid = data&& (data.participant_id || data.player_id) || null;
        if (pid){ localStorage.setItem(pidKey(code), JSON.stringify(pid)); localStorage.setItem("player_id", JSON.stringify(pid)); }
        saveActiveRoom(data);
        return data;
      });
    },
    start_game: function(p){ var code=resolveCode((p&&p.gameId)||(p&&p.code)); if(!code) throw new Error("Missing game id"); return jpost("start_game", { gameId: code }); },
    next_question: function(p){ var code=resolveCode((p&&p.gameId)||(p&&p.code)); if(!code) throw new Error("Missing game id"); return jpost("next_question", { gameId: code }).catch(function(e){ if(e.status===400||e.status===422) throw e; return jpost("next_question", null); }); },
    end_game_and_analyze: function(p){ var code=resolveCode((p&&p.gameId)||(p&&p.code)); if(!code) throw new Error("Missing game id"); return jpost("end_game_and_analyze", { gameId: code }); },
    heartbeat: function(p){ var code=resolveCode((p&&p.gameId)||(p&&p.code)); if(!code) throw new Error("Missing game id"); return jpost("heartbeat", { gameId: code }); },
    participant_heartbeat: function(p){ var code=resolveCode((p&&p.gameId)||(p&&p.code)); if(!code) throw new Error("Missing game id"); var pid=JSON.parse(localStorage.getItem(pidKey(code))||"null"); return jpost("participant_heartbeat", { gameId: code, participant_id: pid }); },
    submit_answer: function(p){ var code=resolveCode((p&&p.gameId)||(p&&p.code)); if(!code) throw new Error("Missing game id"); var pid=JSON.parse(localStorage.getItem(pidKey(code))||"null"); return jpost("submit_answer", { game_id: code, question_id: (p&&p.question_id)||(p&&p.qid)||null, text: (p&&p.text)||(p&&p.answer)||"", temp_player_id: pid, participant_id: pid, name: (p&&p.name)||(p&&p.nickname)||undefined }); }
  };

  // ---------- Header ----------
  async function renderHeader(){
    var app=document.getElementById("app");
    var headerHTML = ""
      + "<div class=\"header\">"
      + "  <a class=\"brand\" href=\"#/\"><img src=\"./assets/logo.png\" alt=\"logo\"/><span>MatchSqr</span></a>"
      + "  <div class=\"right\" id=\"hdrRight\">"
      + "    <a class=\"btn-login\" href=\"#/login\">Login</a>"
      + "    <a class=\"btn-help\" href=\"#/help\">?</a>"
      + "  </div>"
      + "</div>";
    app.innerHTML = headerHTML + app.innerHTML;

    try{
      var session = await getSession();
      var user = session&&session.user||null;
      if (user){
        var name = (user.user_metadata&&user.user_metadata.name) || (user.email? user.email.split("@")[0] : "Account");
        var right = $("#hdrRight");
        if (right){
          right.innerHTML = ""
            + "<a class=\"avatar-link\" href=\"#/account\" title=\""+name+"\"><img class=\"avatar\" src=\"./assets/profile.png\" alt=\"profile\"/></a>"
            + "<a class=\"btn-help\" href=\"#/help\">?</a>";
        }
      }
    }catch(e){}
  }
  function ensureDebugTray(){
    var app = document.getElementById("app");
    if (!document.getElementById("debug-tray")){
      app.insertAdjacentHTML("beforeend", "<div class=\"debug-tray\" id=\"debug-tray\"><pre id=\"debug-pre\"></pre></div>");
    }
    setOfflineBanner(!navigator.onLine);
  }

  // ---------- Router ----------
  var routes={};
  function route(p,h){ routes[p]=h; }
  function parseHash(){ var h=location.hash||"#/"; var parts=h.split("?"); var p=parts[0]; var q=parts[1]||""; return { path:p, query:Object.fromEntries(new URLSearchParams(q)) }; }
  async function navigate(){
    var parsed=parseHash();
    var path=parsed.path;
    var gm = path.match(/^#\/game\/(.+)$/);
    if (routes[path]) return routes[path]();
    if (gm) return pages.game(gm[1]);
    return pages.home();
  }
  addEventListener("hashchange", navigate);

  // ---------- Pages ----------
  var pages={};

  pages.home=async function(){
    var app=document.getElementById("app");
    app.innerHTML = ""
      + "<div class=\"offline-banner\">You are offline. Trying to reconnect...</div>"
      + "<section class=\"home-hero\">"
      + "  <img class=\"globe\" src=\"./assets/globe.png\" alt=\"globe\"/>"
      + "  <h1>Safe space to build meaningful connections.</h1>"
      + "  <p>Play with other people interactive games designed to uncover shared values, emotional style, interests, and personality.</p>"
      + "  <div class=\"cta-row\">"
      + "    <a class=\"cta\" id=\"ctaHost\" href=\"#/host\"><img src=\"./assets/crown.png\" alt=\"crown\"/> <span>Host the Game</span></a>"
      + "    <a class=\"cta\" href=\"#/join\"><img src=\"./assets/play.png\" alt=\"play\"/> <span>Join the Game</span></a>"
      + "  </div>"
      + "</section>"
      + "<a class=\"home-learn\" href=\"#/terms\">Learn more about MatchSqr</a>";
    await renderHeader(); ensureDebugTray();
  };

  pages.login=async function(){
    var app=document.getElementById("app");
    var redirectTo = sessionStorage.getItem("__redirect_after_login") || "#/";
    app.innerHTML = ""
      + "<div class=\"offline-banner\">You are offline. Trying to reconnect...</div>"
      + "<div class=\"container\">"
      + "  <div class=\"card\" style=\"max-width:520px;margin:28px auto;\">"
      + "    <h2>Login</h2>"
      + "    <div class=\"grid\">"
      + "      <input id=\"email\" class=\"input\" placeholder=\"Email\" type=\"email\">"
      + "      <input id=\"password\" class=\"input\" placeholder=\"Password\" type=\"password\">"
      + "      <label><input id=\"remember\" type=\"checkbox\"> Remember me</label>"
      + "      <button id=\"loginBtn\" class=\"btn\">Login</button>"
      + "      <div style=\"display:flex;gap:10px;justify-content:space-between;\">"
      + "        <a class=\"help\" href=\"#/register\">Create account</a>"
      + "        <a class=\"help\" href=\"#/forgot\">Forgot password?</a>"
      + "      </div>"
      + "    </div>"
      + "  </div>"
      + "</div>";
    await renderHeader(); ensureDebugTray();
    $("#loginBtn").onclick=async function(){
      try{
        var r = await sbClient().auth.signInWithPassword({ email:$("#email").value.trim(), password:$("#password").value });
        if (r && r.error) throw r.error;
        var remember = !!$("#remember").checked;
        (remember?localStorage:sessionStorage).setItem("remember_me", JSON.stringify(remember));
        location.hash = redirectTo;
        sessionStorage.removeItem("__redirect_after_login");
      }catch(e){ toast(e.message||"Login failed"); }
    };
  };

  pages.account=async function(){
    var app=document.getElementById("app");
    var session = await getSession();
    var user=session&&session.user||null;
    var name = (user&&user.user_metadata&&user.user_metadata.name) || (user&&user.email? user.email.split("@")[0] : "Account");
    app.innerHTML = ""
      + "<div class=\"offline-banner\">You are offline. Trying to reconnect...</div>"
      + "<div class=\"container\">"
      + "  <div class=\"card\" style=\"max-width:720px;margin:28px auto;\">"
      + "    <h2>Welcome, "+name+"</h2>"
      + "    <div class=\"grid\" style=\"grid-template-columns:1fr 1fr; gap:12px\">"
      + "      <button id=\"logoutBtn\" class=\"ghost\">Logout</button>"
      + "    </div>"
      + "  </div>"
      + "</div>";
    await renderHeader(); ensureDebugTray();
    $("#logoutBtn").onclick=async function(){ await sbClient().auth.signOut(); location.hash="#/"; };
  };

  // ---------- Host ----------
  pages.host=async function(){
    var session = await getSession();
    if (!session){
      sessionStorage.setItem("__redirect_after_login", "#/host");
      location.hash = "#/login"; return;
    }
    var app=document.getElementById("app");
    var ar = storedRoom();
    app.innerHTML = ""
      + "<div class=\"offline-banner\">You are offline. Trying to reconnect...</div>"
      + "<div class=\"host-wrap\">"
      + "  <div class=\"card\">"
      + "    <div class=\"host-head\"><h2>Host a game</h2></div>"
      + "    <div id=\"hostControls\"></div>"
      + "  </div>"
      + "</div>";
    await renderHeader(); ensureDebugTray();
    var el=$("#hostControls");

    function renderHasRoom(code){
      el.innerHTML = ""
        + "<div class=\"grid\">"
        + "  <div class=\"inline-actions\">"
        + "    <button class=\"primary\" id=\"goRoom\">Go to room</button>"
        + "    <button class=\"icon-btn\" id=\"copyCode\" title=\"Copy code\"><img src=\"./assets/copy.png\" alt=\"copy\"/></button>"
        + "    <span class=\"help\">Code: <strong>"+code+"</strong></span>"
        + "  </div>"
        + "</div>";
      $("#goRoom").onclick=function(){ location.hash="#/game/"+code; };
      $("#copyCode").onclick=function(){ navigator.clipboard.writeText(code); toast("Code copied"); };
    }

    var existingCode = extractCodeDeep(ar);
    if (existingCode){ renderHasRoom(existingCode); }
    else{
      el.innerHTML = ""
        + "<div class=\"grid\">"
        + "  <button class=\"primary\" id=\"createGame\">Create Game</button>"
        + "  <p class=\"help\">You will receive a game code and a room for players to join.</p>"
        + "</div>";
      $("#createGame").onclick=async function(){
        try{
          var data = await API.create_game();
          var code = extractCodeDeep(data);
          if (!code){ debug({ create_game_unexpected_response:data }); toast("Created, but no code returned"); return; }
          saveActiveRoom(data);
          renderHasRoom(code); // update immediately
        }catch(e){
          if (e.status===409 && e.data){
            var code2 = extractCodeDeep(e.data);
            if (code2){
              saveActiveRoom(e.data);
              toast("You already have an active room.");
              renderHasRoom(code2);
              return;
            }
          }
          toast(e.message||"Failed to create"); debug({ create_game_error:e });
        }
      };
    }
  };

  // ---------- Join ----------
  pages.join=async function(){
    var app=document.getElementById("app");
    app.innerHTML = ""
      + "<div class=\"offline-banner\">You are offline. Trying to reconnect...</div>"
      + "<div class=\"container\">"
      + "  <div class=\"card\" style=\"max-width:520px;margin:28px auto;\">"
      + "    <h2>Join a game</h2>"
      + "    <div class=\"grid\">"
      + "      <input id=\"gameId\" class=\"input\" placeholder=\"Game code\">"
      + "      <input id=\"nickname\" class=\"input\" placeholder=\"Nickname\">"
      + "      <button id=\"joinBtn\" class=\"btn\" style=\"margin-top:8px;\">Join</button>"
      + "    </div>"
      + "  </div>"
      + "</div>";
    await renderHeader(); ensureDebugTray();
    $("#joinBtn").onclick=async function(){
      var code=$("#gameId").value.trim();
      var nickname=$("#nickname").value.trim();
      if (!code) return toast("Enter game code");
      if (!nickname) return toast("Enter nickname");
      try{ await API.join_game_guest({ code:code, nickname:nickname }); location.hash="#/game/"+code; }
      catch(e){ toast(e.message||"Failed to join"); debug({ join_error:e }); }
    };
  };

  // ---------- Game Room ----------
  var Game={
    code:null, poll:null, tick:null, hbH:null, hbG:null,
    state:{ phase:"lobby", ends_at:null, players:[], active_player_id:null, question:null, host_user_id:null, min_players_required:2 },
    mount: async function(code){
      this.code=code;
      await this.refresh();
      this.startPolling();
      this.startHeartbeats();
      this.startTick();
    },
    startPolling: function(){ if(this.poll) clearInterval(this.poll); var self=this; this.poll=setInterval(function(){ self.refresh(); }, 3000); },
    startTick: function(){ if(this.tick) clearInterval(this.tick); var self=this; this.tick=setInterval(function(){ self.renderTimer(); }, 1000); },
    startHeartbeats: async function(){
      var session = await getSession();
      var user = session&&session.user||null;
      var isHost = (user&&user.id && user.id === this.state.host_user_id);
      var self=this;
      if (isHost){
        if (this.hbH) clearInterval(this.hbH);
        this.hbH = setInterval(function(){ API.heartbeat({ gameId:self.code })["catch"](function(){}); }, 10000);
      }else{
        if (this.hbG) clearInterval(this.hbG);
        this.hbG = setInterval(function(){ API.participant_heartbeat({ gameId:self.code })["catch"](function(){}); }, 10000);
      }
    },
    stop: function(){ if(this.poll) clearInterval(this.poll); if(this.tick) clearInterval(this.tick); if(this.hbH) clearInterval(this.hbH); if(this.hbG) clearInterval(this.hbG); },
    refresh: async function(){ try{ var data=await API.get_state({ code:this.code }); this.state=Object.assign({}, this.state, data); this.render(); }catch(e){ debug({ refresh_error:e.message }); } },
    isActivePlayer: function(){ try{ var me=JSON.parse(localStorage.getItem("player_id")||sessionStorage.getItem("player_id")||"null"); return me && me===this.state.active_player_id; }catch(e){ return false; } },
    remainingSeconds: function(){ if (!this.state.ends_at) return null; var diff=Math.floor((new Date(this.state.ends_at).getTime()-Date.now())/1000); return Math.max(0,diff); },
    renderTimer: function(){
      var t=this.remainingSeconds(), el=document.getElementById("roomTimer"); if(!el) return;
      if (t==null) { el.textContent="--:--"; return; }
      var m=String(Math.floor(t/60)).padStart(2,"0"), s=String(t%60).padStart(2,"0");
      el.textContent=m+":"+s;
      var extendBtn=$("#extendBtn"); if (extendBtn){ if(!(t<=600)){ extendBtn.setAttribute("disabled",""); } else { extendBtn.removeAttribute("disabled"); } }
    },
    render: async function(){
      var s=this.state; var main=$("#mainCard"); var controls=$("#controlsRow");
      main.innerHTML=""; controls.innerHTML="";
      var session = await getSession(); var user=session&&session.user||null;
      var isHost = !!(user&&user.id && s.host_user_id && user.id===s.host_user_id);
      var minPlayers = s.min_players_required || 2;
      var enoughPlayers = (s.players&&s.players.length>=minPlayers);

      if (s.phase==="lobby"){
        var wrap=document.createElement("div"); wrap.style.cssText="display:flex;flex-direction:column;align-items:center;gap:8px;";
        var startBtn=document.createElement("button"); startBtn.className="start-round"; startBtn.id="startGame"; startBtn.textContent="Start";
        startBtn.disabled = !(isHost && enoughPlayers);
        startBtn.onclick=async function(){
          if(!isHost) return toast("Only host can start");
          if(!enoughPlayers) return toast("Need at least "+minPlayers+" players");
          try{ await API.start_game({ gameId:Game.code }); await Game.refresh(); }catch(e){ toast(e.message||"Start failed"); debug({ start_error:e }); }
        };
        var help=document.createElement("div"); help.className="help";
        help.textContent = !isHost ? "Waiting for the host..." : (!enoughPlayers ? "Need at least "+minPlayers+" players to start." : "Ready to start.");
        wrap.appendChild(startBtn); wrap.appendChild(help); main.appendChild(wrap);
        return;
      }

      if (s.phase==="running"){
        var hdr=document.createElement("div"); hdr.style.cssText="position:absolute; top:16px; right:16px; font-weight:800;";
        hdr.innerHTML="\\u23F1 <span id=\"roomTimer\">--:--</span>"; main.appendChild(hdr);

        var q=document.createElement("div"); q.style.cssText="text-align:center; max-width:640px; padding:8px";
        q.innerHTML = "<h3 style=\"margin:0 0 8px 0;\">"+(s.question&&s.question.title||"Question")+"</h3><p class=\"help\" style=\"margin:0;\">"+(s.question&&s.question.text||"")+"</p>";
        main.appendChild(q);

        var km=document.createElement("div"); km.className="kb-mic-row";
        km.innerHTML=""
          + "<button id=\"micBtn\" class=\"kb-mic-btn\" "+(this.isActivePlayer()?"":"disabled")+"><img src=\"./assets/mic.png\" alt=\"mic\"/> <span>Mic</span></button>"
          + "<button id=\"kbBtn\" class=\"kb-mic-btn\" "+(this.isActivePlayer()?"":"disabled")+"><img src=\"./assets/keyboard.png\" alt=\"kb\"/> <span>Keyboard</span></button>";
        main.appendChild(km);

        var ans=document.createElement("div"); ans.className="answer-row hidden"; ans.id="answerRow";
        ans.innerHTML = "<input id=\"answerInput\" class=\"input\" placeholder=\"Type your answer...\" "+(this.isActivePlayer()?"":"disabled")+">"
                      + "<button id=\"submitBtn\" class=\"btn\" "+(this.isActivePlayer()?"":"disabled")+">Submit</button>";
        main.appendChild(ans);

        $("#micBtn").onclick=function(){ $("#answerRow").classList.remove("hidden"); };
        $("#kbBtn").onclick=function(){ $("#answerRow").classList.remove("hidden"); };
        $("#submitBtn").onclick=async function(){
          if (!Game.isActivePlayer()) return;
          var text=$("#answerInput").value.trim(); if (!text) return;
          try{ await API.submit_answer({ gameId:Game.code, text:text }); $("#answerInput").value=""; await Game.refresh(); }catch(e){ toast(e.message||"Submit failed"); debug({ submit_error:e }); }
        };

        controls.innerHTML=""
          + "<button id=\"nextCard\" class=\"btn\" "+(isHost?"":"disabled")+">Reveal next card</button>"
          + "<button id=\"extendBtn\" class=\"btn secondary\" disabled>Extend</button>"
          + "<button id=\"endAnalyze\" class=\"btn danger\" "+(isHost?"":"disabled")+">End and analyze</button>";
        $("#nextCard").onclick=async function(){ if(!isHost) return; try{ await API.next_question({ gameId:Game.code }); await Game.refresh(); }catch(e){ toast(e.message||\"Next failed\"); debug({ next_error:e }); } };
        $("#extendBtn").onclick=function(){ location.hash=\"#/billing\"; };
        $("#endAnalyze").onclick=async function(){ if(!isHost) return; try{ await API.end_game_and_analyze({ gameId:Game.code }); await Game.refresh(); }catch(e){ toast(e.message||\"End failed\"); debug({ end_error:e }); } };
        Game.renderTimer();
        return;
      }

      if (s.phase==="ended"){
        main.innerHTML = ""
          + "<div style=\"text-align:center; max-width:640px;\">"
          + "  <h3>Summary</h3>"
          + "  <p class=\"help\">A quick view of how the game went. Full report can be emailed.</p>"
          + "  <div style=\"display:flex;gap:10px;flex-wrap:wrap;justify-content:center;\">"
          + "    <button id=\"emailReport\" class=\"btn\">Email me my full report</button>"
          + "    <button id=\"shareBtn\" class=\"btn secondary\">Share</button>"
          + "  </div>"
          + "  <p class=\"help\" style=\"margin-top:10px;\">Note, data is retained for about 30 minutes.</p>"
          + "</div>";
        $("#emailReport").onclick=function(){ toast("Report requested. Check your email."); };
        $("#shareBtn").onclick=function(){ navigator.clipboard.writeText(location.href); toast("Link copied"); };
        return;
      }
    }
  };

  pages.game=async function(code){
    var app=document.getElementById("app");
    app.innerHTML=""
      + "<div class=\"offline-banner\">You are offline. Trying to reconnect...</div>"
      + "<div class=\"room-wrap\">"
      + "  <div class=\"card main-card\" id=\"mainCard\"></div>"
      + "  <div class=\"controls-row\" id=\"controlsRow\"></div>"
      + "</div>";
    await renderHeader(); ensureDebugTray();
    Game.mount(code);
  };

  // ---------- Static ----------
  pages.billing=async function(){ var app=document.getElementById("app"); app.innerHTML=""
    + "<div class=\"offline-banner\">You are offline. Trying to reconnect...</div>"
    + "<div class=\"container\"><div class=\"card\" style=\"max-width:720px;margin:28px auto;\">"
    + "<h2>Billing</h2><div class=\"grid\">"
    + "<button class=\"btn\" id=\"extend\">Extend game by 60 min</button>"
    + "<button class=\"btn secondary\" id=\"extra\">Buy extra weekly game</button>"
    + "<button class=\"btn warn\" id=\"sub\">Subscribe</button>"
    + "</div></div></div>"; await renderHeader(); ensureDebugTray();
    $("#extend").onclick=function(){ toast("Simulated: extended"); }; $("#extra").onclick=function(){ toast("Simulated: extra weekly game purchased"); }; $("#sub").onclick=function(){ toast("Simulated: subscription active"); }; };
  pages.terms=async function(){ var app=document.getElementById("app"); app.innerHTML="<div class=\"container\"><div class=\"card\" style=\"margin:28px auto;max-width:840px;\"><h2>Terms</h2><p class=\"help\">...</p></div></div>"; await renderHeader(); ensureDebugTray(); };
  pages.privacy=async function(){ var app=document.getElementById("app"); app.innerHTML="<div class=\"container\"><div class=\"card\" style=\"margin:28px auto;max-width:840px;\"><h2>Privacy</h2><p class=\"help\">...</p></div></div>"; await renderHeader(); ensureDebugTray(); };
  pages.help=async function(){ var app=document.getElementById("app"); app.innerHTML="<div class=\"container\"><div class=\"card\" style=\"margin:28px auto;max-width:720px;\"><h2>Help</h2><p class=\"help\">...</p></div></div>"; await renderHeader(); ensureDebugTray(); };

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
