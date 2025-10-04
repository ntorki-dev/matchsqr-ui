import { supabase } from "./config.js";

// ---------- Utils ----------
const log = (...args) => { if (window.__DEBUG__) console.log("[MS]", ...args); };
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function toast(msg, ms=2500){
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function setOfflineBanner(show){
  const b = document.querySelector(".offline-banner");
  if (!b) return;
  b.classList.toggle("show", !!show);
}
window.addEventListener("offline", () => setOfflineBanner(true));
window.addEventListener("online", () => setOfflineBanner(false));

// ---------- Storage ----------
const storage = {
  set(key, val, remember=false){ (remember?localStorage:sessionStorage).setItem(key, JSON.stringify(val)); },
  get(key){ try{ const v = localStorage.getItem(key) ?? sessionStorage.getItem(key); return v?JSON.parse(v):null; }catch(e){ return null; } },
  del(key){ localStorage.removeItem(key); sessionStorage.removeItem(key); }
};

// ---------- Router ----------
const routes = {};
function route(path, handler){ routes[path] = handler; }
function notFound(){ renderLayout(`<div class="container"><h2>Not found</h2></div>`); }
function parseHash(){ const h = location.hash || "#/"; const [path, q] = h.split("?"); return { path, query:Object.fromEntries(new URLSearchParams(q)) }; }
async function navigate(){
  const { path } = parseHash();
  const m = path.match(/^#\/game\/(.+)$/);
  if (routes[path]) return routes[path]();
  if (m) return pages.game(m[1]);
  return notFound();
}
window.addEventListener("hashchange", navigate);

// ---------- Layout ----------
function renderLayout(content){
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="offline-banner">You are offline. Trying to reconnect…</div>
    <div class="navbar container">
      <a class="nav-logo" href="#/">
        <img src="./assets/logo.png" alt="logo" />
        <strong>Match Square</strong>
      </a>
      <div class="nav-right">
        <a class="btn ghost" href="#/host">Host</a>
        <a class="btn ghost" href="#/join">Join</a>
        <a class="btn secondary" href="#/account">
          <img class="avatar" src="./assets/profile.png" alt="profile"/>
        </a>
      </div>
    </div>
    ${content}
    <div class="debug-tray" id="debug-tray"><pre id="debug-pre"></pre></div>
  `;
  if (parseHash().query.debug === "1") $("#debug-tray").style.display = "block";
  setOfflineBanner(!navigator.onLine);
}
function debug(obj){ const pre = $("#debug-pre"); if (!pre) return; const s = pre.textContent + "\n" + JSON.stringify(obj, null, 2); pre.textContent = s.slice(-25000); }

// ---------- Auth ----------
const Auth = {
  user: null,
  async load(){ const { data:{ user } } = await supabase.auth.getUser(); this.user = user; return user; },
  async login(email, password, remember){ const { data, error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; storage.set("remember_me", !!remember, !!remember); return data.user; },
  async register({ email, password, name, dob, gender }){
    const { data, error } = await supabase.auth.signUp({ email, password, options:{ data:{ name, dob, gender }}});
    if (error) throw error; return data.user;
  },
  async logout(){ await supabase.auth.signOut(); this.user = null; }
};

// ---------- API Wrappers + MOCK ----------
async function invoke(name, payload){
  try {
    if (window.__MOCK__) return Mock.invoke(name, payload);
    debug({ invoke:name, payload });
    const { data, error } = await supabase.functions.invoke(name, { body: payload });
    if (error) throw error;
    debug({ result: data });
    return data;
  } catch(e){
    log("invoke error", name, e);
    toast("Something went wrong, see console");
    throw e;
  }
}
const API = {
  createGame: (opts)      => invoke("create_game", opts),
  joinGuest: (payload)    => invoke("join_game_guest", payload),
  startGame: (payload)    => invoke("start_game", payload),
  nextQuestion: (payload) => invoke("next_question", payload),
  endAnalyze: (payload)   => invoke("end_game_and_analyze", payload),
  entitlementCheck: (payload) => invoke("entitlement_check", payload),
  getState: (payload)     => invoke("get_state", payload)
};

// Built-in simulator for self-test without backend
const Mock = {
  _db: {
    game_code: "ABCD12",
    phase: "lobby",
    ends_at: null,
    idx: 0,
    players: [{id:"p1", name:"Host"}, {id:"p2", name:"Guest"}],
    active_player_id: "p1",
    questions: [
      { title:"Q1", text:"What energizes you lately?" },
      { title:"Q2", text:"What does a perfect day look like for you?" }
    ]
  },
  async invoke(name, payload){
    const S = this._db;
    if (name==="create_game") return { game_code: S.game_code };
    if (name==="join_game_guest") return { player_id:"p2" };
    if (name==="start_game"){
      S.phase="running";
      const end = new Date(Date.now()+ 20*60*1000); // 20 min
      S.ends_at = end.toISOString();
      return { ok:true };
    }
    if (name==="next_question"){
      S.idx = Math.min(S.idx+1, S.questions.length-1);
      S.active_player_id = (S.active_player_id==="p1")?"p2":"p1";
      return { ok:true };
    }
    if (name==="end_game_and_analyze"){
      S.phase="ended"; return { ok:true };
    }
    if (name==="get_state"){
      return {
        phase: S.phase,
        ends_at: S.ends_at,
        players: S.players,
        active_player_id: S.active_player_id,
        question: S.questions[S.idx] || null
      };
    }
    if (name==="entitlement_check"){ return { ok:true }; }
    return { ok:true };
  }
};

// ---------- Pages ----------
const pages = {};

// Home
pages.home = () => {
  renderLayout(`
    <section class="container">
      <div class="grid grid-2">
        <div class="card">
          <h1>Build real connection, one game at a time.</h1>
          <p class="help">Start a game with someone new, discover compatibility through questions, then unlock chat at 90%.</p>
          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:10px;">
            <a class="btn" href="#/host">Host a game</a>
            <a class="btn ghost" href="#/join">Join a game</a>
          </div>
        </div>
        <div class="card">
          <img src="./assets/globe.png" alt="illustration" style="width:100%; height:auto; border-radius:12px;" />
        </div>
      </div>
    </section>
  `);
};

// Login
pages.login = () => {
  renderLayout(`
    <section class="container" style="max-width:520px;">
      <div class="card">
        <h2>Login</h2>
        <div class="grid">
          <input id="email" class="input" placeholder="Email" type="email" autocomplete="email"/>
          <input id="password" class="input" placeholder="Password" type="password" autocomplete="current-password"/>
          <label style="display:flex; gap:8px; align-items:center;">
            <input id="remember" type="checkbox"/> Remember me
          </label>
          <button id="loginBtn" class="btn">Login</button>
          <div style="display:flex; gap:10px; justify-content:space-between;">
            <a class="help" href="#/register">Create account</a>
            <a class="help" href="#/forgot">Forgot password?</a>
          </div>
        </div>
      </div>
    </section>
  `);
  $("#loginBtn").onclick = async () => {
    const email = $("#email").value.trim();
    const password = $("#password").value;
    const remember = $("#remember").checked;
    try{ await Auth.login(email, password, remember); toast("Welcome back"); location.hash = "#/"; }
    catch(e){ toast(e.message || "Login failed"); }
  };
};

// Register
pages.register = () => {
  renderLayout(`
    <section class="container" style="max-width:640px;">
      <div class="card">
        <h2>Create account</h2>
        <div class="grid grid-2">
          <input id="name" class="input" placeholder="Full name"/>
          <input id="dob" class="input" placeholder="Date of birth" type="date"/>
          <select id="gender" class="select">
            <option value="">Gender</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
          <input id="email" class="input" placeholder="Email" type="email"/>
          <input id="password" class="input" placeholder="Password" type="password"/>
          <label style="grid-column:1 / -1;">
            <input id="consent" type="checkbox"/> I agree to the <a href="#/terms">Terms</a> and <a href="#/privacy">Privacy Policy</a>
          </label>
          <button id="registerBtn" class="btn" style="grid-column:1 / -1;">Create account</button>
          <div><a class="help" href="#/login">Already have an account? Login</a></div>
        </div>
      </div>
    </section>
  `);
  $("#registerBtn").onclick = async () => {
    const payload = {
      name: $("#name").value.trim(),
      dob: $("#dob").value,
      gender: $("#gender").value,
      email: $("#email").value.trim(),
      password: $("#password").value
    };
    if (!$("#consent").checked) return toast("Please accept Terms and Privacy");
    try{ await Auth.register(payload); toast("Check your email to verify"); location.hash = "#/login"; }
    catch(e){ toast(e.message || "Registration failed"); }
  };
};

// Forgot / Reset
pages.forgot = () => {
  renderLayout(`
    <section class="container" style="max-width:520px;">
      <div class="card">
        <h2>Forgot password</h2>
        <input id="email" class="input" placeholder="Email" type="email"/>
        <button id="forgotBtn" class="btn" style="margin-top:10px;">Send reset link</button>
      </div>
    </section>
  `);
  $("#forgotBtn").onclick = async () => {
    const email = $("#email").value.trim();
    try{
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/#/reset" });
      if (error) throw error;
      toast("Reset email sent");
    }catch(e){ toast(e.message || "Failed to send link"); }
  };
};
pages.reset = () => {
  renderLayout(`
    <section class="container" style="max-width:520px;">
      <div class="card">
        <h2>Reset password</h2>
        <input id="password" class="input" placeholder="New password" type="password"/>
        <button id="resetBtn" class="btn" style="margin-top:10px;">Update password</button>
      </div>
    </section>
  `);
  $("#resetBtn").onclick = async () => {
    try{
      const newPassword = $("#password").value;
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast("Password updated");
      location.hash = "#/login";
    }catch(e){ toast(e.message || "Failed to update"); }
  };
};

// Host
pages.host = () => {
  renderLayout(`
    <section class="container">
      <div class="card">
        <h2>Host a game</h2>
        <div id="hostControls"></div>
      </div>
    </section>
  `);
  renderHostControls();
};
async function renderHostControls(){
  const state = storage.get("active_room");
  const el = $("#hostControls");
  if (state && state.game_code){
    el.innerHTML = `
      <div class="grid">
        <div>Active room: <strong>${state.game_code}</strong></div>
        <div style="display:flex; gap:10px;">
          <button class="btn" id="goRoom">Go to room</button>
          <button class="btn ghost" id="copyLink">Copy invite</button>
        </div>
      </div>
    `;
    $("#goRoom").onclick = () => location.hash = "#/game/" + state.game_code;
    $("#copyLink").onclick = () => { navigator.clipboard.writeText(location.origin + "/#/game/" + state.game_code); toast("Link copied"); };
  }else{
    el.innerHTML = `
      <div class="grid">
        <button class="btn" id="createGame">Create Game</button>
        <p class="help">You will receive a game code and lobby page to invite players.</p>
      </div>
    `;
    $("#createGame").onclick = async () => {
      try{
        const data = await API.createGame({});
        storage.set("active_room", data, true);
        location.hash = "#/game/" + data.game_code;
      }catch(e){}
    };
  }
}

// Join
pages.join = () => {
  renderLayout(`
    <section class="container" style="max-width:520px;">
      <div class="card">
        <h2>Join a game</h2>
        <input id="gameId" class="input" placeholder="Game code" />
        <input id="nickname" class="input" placeholder="Nickname (optional)" />
        <button id="joinBtn" class="btn" style="margin-top:10px;">Join</button>
      </div>
    </section>
  `);
  $("#joinBtn").onclick = async () => {
    const game_code = $("#gameId").value.trim();
    const nickname  = $("#nickname").value.trim() || undefined;
    if (!game_code) return toast("Enter game code");
    try{
      const data = await API.joinGuest({ game_code, nickname });
      storage.set("active_room", { game_code }, true);
      storage.set("player_id", data.player_id || "p2", true);
      location.hash = "#/game/" + game_code;
    }catch(e){}
  };
};

// Account
pages.account = () => {
  renderLayout(`
    <section class="container" style="max-width:720px;">
      <div class="card">
        <h2>Account</h2>
        <div class="grid grid-2">
          <input id="name" class="input" placeholder="Name" />
          <input id="dob" class="input" placeholder="Date of birth" type="date"/>
          <select id="gender" class="select">
            <option value="">Gender</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
          <button id="saveProfile" class="btn">Save</button>
          <button id="sendReport" class="btn secondary">Send latest report to my email</button>
        </div>
      </div>
    </section>
  `);
  $("#sendReport").onclick = () => toast("Email requested. Check your inbox");
};

// Terms / Privacy
pages.terms   = () => { renderLayout(`<section class="container"><div class="card"><h2>Terms</h2><p class="help">Your terms content here.</p></div></section>`); };
pages.privacy = () => { renderLayout(`<section class="container"><div class="card"><h2>Privacy</h2><p class="help">Your privacy policy here.</p></div></section>`); };

// Billing (simulated)
pages.billing = () => {
  renderLayout(`
    <section class="container" style="max-width:720px;">
      <div class="card">
        <h2>Billing</h2>
        <div class="grid">
          <button class="btn" id="extend">Extend game by 60 min</button>
          <button class="btn secondary" id="extra">Buy extra weekly game</button>
          <button class="btn warn" id="sub">Subscribe</button>
        </div>
      </div>
    </section>
  `);
  $("#extend").onclick = () => { storage.set("sim_extend_success", true, true); toast("Simulated: extended"); };
  $("#extra").onclick = () => { toast("Simulated: extra weekly game purchased"); };
  $("#sub").onclick   = () => { toast("Simulated: subscription active"); };
};

// Game route with states: lobby, running, ended(summary in-room)
pages.game = (code) => {
  renderLayout(`<section class="container"><div id="gameRoot"></div></section>`);
  GameController.mount(code);
};

const GameController = {
  code: null,
  state: { phase:"lobby", ends_at:null, players:[], active_player_id:null, question:null },
  poller: null,

  async mount(code){
    this.code = code;
    $("#gameRoot").innerHTML = `<div class="card"><h2>Game ${code}</h2><div id="gameCard"></div></div>`;
    this.render();
    await this.refresh();
    this.startPolling();
  },
  unmount(){ if (this.poller) clearInterval(this.poller); },
  startPolling(){ if (this.poller) clearInterval(this.poller); this.poller = setInterval(() => this.refresh(), 3500); },
  async refresh(){
    try{
      const data = await API.getState({ game_code:this.code });
      this.state = Object.assign({}, this.state, data);
      this.render();
    }catch(e){ log("state refresh error", e); }
  },
  render(){
    const root = $("#gameCard");
    const s = this.state;
    if (s.phase==="lobby")   return this.renderLobby(root);
    if (s.phase==="running") return this.renderRunning(root);
    if (s.phase==="ended")   return this.renderSummary(root);
    return this.renderLobby(root);
  },
  renderLobby(root){
    const players = (this.state.players||[]).map(p => `<li>${p.name||p.nickname||"Player"}</li>`).join("");
    root.innerHTML = `
      <div class="grid">
        <div>Share this code: <strong>${this.code}</strong></div>
        <div style="display:flex; gap:10px;">
          <button class="btn" id="copyInvite">Copy invite</button>
          <button class="btn warn" id="startGame">Start</button>
        </div>
        <div class="card"><strong>Players</strong><ul>${players || "<li>No players yet</li>"}</ul></div>
      </div>
    `;
    $("#copyInvite").onclick = () => { navigator.clipboard.writeText(location.origin + "/#/game/" + this.code); toast("Link copied"); };
    $("#startGame").onclick  = async () => { try{ await API.startGame({ game_code:this.code }); await this.refresh(); }catch(e){} };
  },
  countdownText(endsAtIso){
    if (!endsAtIso) return "";
    const end = new Date(endsAtIso).getTime();
    const now = Date.now();
    const diff = Math.max(0, Math.floor((end - now)/1000));
    const m = String(Math.floor(diff/60)).padStart(2, "0");
    const s = String(diff%60).padStart(2, "0");
    return `${m}:${s}`;
  },
  isActivePlayer(){ const me = storage.get("player_id"); return me && me === this.state.active_player_id; },
  renderRunning(root){
    const remaining = this.countdownText(this.state.ends_at);
    const canExtend = remaining && (()=>{ const [mm,ss] = remaining.split(":").map(Number); return (mm*60+ss) <= 600; })();
    root.innerHTML = `
      <div class="grid">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div>
            <span class="badge-dot simple" title="Simple"></span>
            <span class="badge-dot medium" title="Medium"></span>
            <span class="badge-dot deep" title="Deep"></span>
          </div>
          <div class="timer">⏱ ${remaining || "--:--"}</div>
        </div>

        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0;">${this.state.question?.title || "Question"}</h3>
            <button class="btn ghost" id="clarifyBtn" title="Clarification">?</button>
          </div>
          <p class="help">${this.state.question?.text || ""}</p>

          <div style="display:flex; gap:8px; margin-top:10px;">
            <button id="micBtn" class="btn secondary" ${this.isActivePlayer() ? "" : "disabled"}>
              <img src="./assets/mic.png" alt="mic" style="width:18px;height:18px;vertical-align:middle;"/> Mic
            </button>
            <input id="answer" class="input" placeholder="Type your answer..." ${this.isActivePlayer() ? "" : "disabled"} />
            <button id="submitBtn" class="btn" ${this.isActivePlayer() ? "" : "disabled"}>Submit</button>
          </div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="nextCard" class="btn">Reveal next card</button>
          <a class="btn secondary" href="#/billing" ${canExtend ? "" : "aria-disabled='true'"}>Extend</a>
          <button id="endAnalyze" class="btn danger">End and analyze</button>
        </div>
      </div>

      <dialog id="clarifyModal" style="padding:0; border:0; border-radius:12px; max-width:560px;">
        <div class="card">
          <h3 style="margin-top:0;">Clarification</h3>
          <p class="help">This is a short explanation about this question. Keep it brief and helpful.</p>
          <div style="text-align:right;"><button class="btn ghost" id="closeClarify">Close</button></div>
        </div>
      </dialog>
    `;
    $("#clarifyBtn").onclick = () => $("#clarifyModal").showModal();
    $("#closeClarify").onclick = () => $("#clarifyModal").close();

    $("#submitBtn")?.addEventListener("click", async () => {
      if (!this.isActivePlayer()) return;
      const text = $("#answer").value.trim();
      if (!text) return;
      try{ await API.nextQuestion({ game_code:this.code, answer:text }); $("#answer").value=""; await this.refresh(); }catch(e){}
    });

    $("#nextCard").onclick = async () => { try{ await API.nextQuestion({ game_code:this.code }); await this.refresh(); }catch(e){} };
    $("#endAnalyze").onclick = async () => { try{ await API.endAnalyze({ game_code:this.code }); await this.refresh(); }catch(e){} };
  },
  renderSummary(root){
    const isLoggedIn = !!Auth.user;
    root.innerHTML = `
      <div class="grid">
        <div class="card">
          <h3>Summary</h3>
          <p class="help">A quick view of how the game went. Full report can be emailed.</p>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            ${isLoggedIn ? `<button id="emailReport" class="btn">Email me my full report</button>` : `<a class="btn" href="#/register" target="_blank">Register to get full report</a>`}
            <button id="copyShare" class="btn secondary">
              <img src="./assets/share.png" alt="share" style="width:18px;height:18px;vertical-align:middle;"/> Share
            </button>
          </div>
          <p class="help">Note, data is retained for about 30 minutes.</p>
        </div>
      </div>
    `;
    $("#emailReport")?.addEventListener("click", async () => { toast("Report requested. Check your email."); });
    $("#copyShare").onclick = () => { navigator.clipboard.writeText(location.href); toast("Link copied"); };
  }
};

// ---------- Route bindings ----------
route("#/", pages.home);
route("#/login", pages.login);
route("#/register", pages.register);
route("#/forgot", pages.forgot);
route("#/reset", pages.reset);
route("#/host", pages.host);
route("#/join", pages.join);
route("#/account", pages.account);
route("#/billing", pages.billing);
route("#/terms", pages.terms);
route("#/privacy", pages.privacy);

// ---------- Boot ----------
(async function boot(){
  await Auth.load();
  if (!location.hash) location.hash = "#/";
  navigate();
})();