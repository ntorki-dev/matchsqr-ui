
(function(){
  const S = { supa:null, session:null, base:null };

  async function ensureConfig(){
    const raw = (window.CONFIG && window.CONFIG.FUNCTIONS_BASE) || "";
    const base = raw.replace(/\/$/, "");
    if (!base) throw new Error("Missing CONFIG.FUNCTIONS_BASE");
    S.base = base;
    const r = await fetch(base + "/config");
    const out = await r.json().catch(()=>({}));
    const url = out.supabase_url || out.public_supabase_url || out.url || (window.CONFIG && window.CONFIG.FALLBACK_SUPABASE_URL);
    const anon = out.supabase_anon_key || out.public_supabase_anon || out.anon || (window.CONFIG && window.CONFIG.FALLBACK_SUPABASE_ANON_KEY);
    if (!url || !anon) throw new Error("Missing Supabase url/anon");
    S.supa = window.supabase.createClient(url, anon);
    const s = await S.supa.auth.getSession();
    S.session = s.data.session || null;
  }

  function authHeader(){
    if (!S.session || !S.session.access_token) return {};
    return { authorization: "Bearer " + S.session.access_token };
  }

  async function login(email, password, remember){
    const { data, error } = await S.supa.auth.signInWithPassword({ email, password });
    if (error) throw error;
    S.session = data.session;
    const blob = JSON.stringify(S.session);
    if (remember) localStorage.setItem("ms_session", blob);
    else sessionStorage.setItem("ms_session", blob);
    return data;
  }
  async function register(email, password){
    const { data, error } = await S.supa.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }
  async function logout(){ await S.supa.auth.signOut(); S.session=null; localStorage.removeItem("ms_session"); sessionStorage.removeItem("ms_session"); }
  function getUserEmail(){ return S.session && S.session.user && S.session.user.email || null; }

  function getDevicePid(code){ try{ return localStorage.getItem("ms_pid_"+code) || null; }catch(_){ return null; } }
  function setDevicePid(code, pid){ try{ localStorage.setItem("ms_pid_"+code, String(pid)); }catch(_){ } }

  async function createGame(){
    const r = await fetch(S.base + "/create_game", { method:"POST", headers: { "content-type":"application/json", ...authHeader() }, body: "{}" });
    const out = await r.json().catch(()=>({}));
    if (!r.ok){
      if (out && out.error === "host_has_active_game" && out.code) return { ok:true, code:out.code, id: out.game_id };
      throw new Error(out && out.error || "create_failed");
    }
    return { ok:true, code: out.code, id: out.id, participant_id: out.participant_id };
  }
  async function joinGameGuest(code, name){
    const headers = { "content-type":"application/json" };
    if (S.session && S.session.access_token) headers["authorization"] = "Bearer "+S.session.access_token;
    const devicePid = getDevicePid(code);
    const body = { code, name: name || null, participant_id: devicePid || null };
    const r = await fetch(S.base + "/join_game_guest", { method:"POST", headers, body: JSON.stringify(body) });
    const out = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(out && out.error || "join_failed");
    if (out.participant_id) setDevicePid(code, out.participant_id);
    return out;
  }
  async function startGame(gameId){
    const r = await fetch(S.base + "/start_game", { method:"POST", headers:{ "content-type":"application/json", ...authHeader() }, body: JSON.stringify({ game_id: gameId }) });
    const out = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(out && out.error || "start_failed");
    return out;
  }
  async function revealNext(code, gameId){
    const r = await fetch(S.base + "/next_question", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ code, game_id: gameId }) });
    const out = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(out && out.error || "next_failed");
    return out;
  }
  async function submitAnswer(payload){
    const r = await fetch(S.base + "/submit_answer", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify(payload) });
    const out = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(out && out.error || "submit_failed");
    return out;
  }
  async function endGameAndAnalyze(gameId){
    const r = await fetch(S.base + "/end_game_and_analyze", { method:"POST", headers:{ "content-type":"application/json", ...authHeader() }, body: JSON.stringify({ game_id: gameId }) });
    const out = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(out && out.error || "end_failed");
    return out;
  }
  async function getState(params){
    const r = await fetch(S.base + "/get_state", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify(params) });
    const out = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(out && out.error || "state_failed");
    return out;
  }
  async function emailFullReport(){
    const r = await fetch(S.base + "/email_full_report", { method:"POST", headers:{ "content-type":"application/json", ...authHeader() }, body: "{}" });
    const out = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(out && out.error || "report_failed");
    return out;
  }

  window.msApi = {
    ensureConfig, login, register, logout, getUserEmail,
    createGame, joinGameGuest, startGame, revealNext, submitAnswer, endGameAndAnalyze, getState, emailFullReport,
    getDevicePid, setDevicePid
  };
})();
