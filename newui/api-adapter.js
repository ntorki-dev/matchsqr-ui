let supa = null;
let session = null;
let functionsBase = null;

async function ensureBoot(){
  if (functionsBase) return;
  const cfg = (window.CONFIG || {});
  const baseRaw = (cfg.FUNCTIONS_BASE || "").trim();
  functionsBase = baseRaw.replace(/\/$/, "");
  if(!functionsBase) throw new Error("CONFIG.FUNCTIONS_BASE missing in config.js");

  if(!window.supabase || !window.supabase.createClient){
    throw new Error("Supabase SDK missing on page");
  }

  const res = await fetch(functionsBase + "/config");
  const txt = await res.text();
  let pub = {};
  try { pub = JSON.parse(txt) } catch {}
  const url  = pub.supabase_url  || pub.public_supabase_url || pub.url  || cfg.FALLBACK_SUPABASE_URL;
  const anon = pub.supabase_anon || pub.public_supabase_anon_key || pub.anon || cfg.FALLBACK_SUPABASE_ANON_KEY;
  if(!url || !anon) throw new Error("Supabase url/anon missing from /config and FALLBACK_* in config.js");

  supa = window.supabase.createClient(url, anon);
  const s = await supa.auth.getSession(); session = s?.data?.session || null;
}

function authHeader(){
  const headers = { "content-type": "application/json" };
  if (session?.access_token) headers["authorization"] = "Bearer " + session.access_token;
  return headers;
}

export async function isLoggedIn(){
  await ensureBoot();
  const { data } = await supa.auth.getSession();
  session = data?.session || null;
  return !!session;
}

// ===== Auth =====
export async function authLogin(email, password){
  await ensureBoot();
  const r = await supa.auth.signInWithPassword({ email, password });
  if (r.error) throw new Error(r.error.message);
  session = r.data.session;
  return { ok: true };
}

export async function authRegister(payload){
  await ensureBoot();
  const { email, password, name, birthdate, gender } = payload || {};
  const r = await supa.auth.signUp({ email, password });
  if (r.error) throw new Error(r.error.message);
  session = r.data.session || null;
  try {
    const uid = r.data.user?.id;
    if (uid){
      await supa.from("profiles").upsert({ id: uid, name, birthdate, gender }, { onConflict: "id" });
    }
  } catch {}
  return { ok: true };
}

export async function authSendReset(email){
  await ensureBoot();
  const origin = location.origin.replace(/\/$/, "");
  const redirectTo = origin + location.pathname + "#/reset-password";
  const r = await supa.auth.resetPasswordForEmail(email, { redirectTo });
  if (r.error) throw new Error(r.error.message);
  return { ok: true };
}

export async function authResetPassword(newPassword){
  await ensureBoot();
  const r = await supa.auth.updateUser({ password: newPassword });
  if (r.error) throw new Error(r.error.message);
  return { ok: true };
}

export async function authSignOut(){
  await ensureBoot();
  await supa.auth.signOut();
  session = null;
  return { ok: true };
}

// ===== Profile =====
export async function profileGet(){
  await ensureBoot();
  const u = await supa.auth.getUser();
  const user = u?.data?.user || null;
  if(!user) return null;
  let profile = null;
  try {
    const { data } = await supa.from("profiles").select("*").eq("id", user.id).single();
    profile = data || null;
  } catch {}
  return { id: user.id, email: user.email, ...(profile||{}) };
}

export async function profileUpdate({ name=null, birthdate=null, gender=null }){
  await ensureBoot();
  const u = await supa.auth.getUser();
  const user = u?.data?.user || null;
  if(!user) throw new Error("Not logged in");
  const { error } = await supa.from("profiles").upsert({ id: user.id, name, birthdate, gender }, { onConflict: "id" });
  if (error) throw new Error(error.message || "Failed to update");
  return { ok: true };
}

// ===== Game/Room =====
async function ensureSession(){
  await ensureBoot();
  if (!session){
    const { data } = await supa.auth.getSession();
    session = data?.session || null;
  }
}

async function getStateByCode(code){
  const r = await fetch(functionsBase + "/get_state?code=" + encodeURIComponent(code));
  const out = await r.json().catch(()=>({}));
  if (!r.ok) {
    const e = new Error(out?.error || r.statusText || "get_state failed");
    e.status = r.status; e.code = out?.error || out?.code || null; e.details = out;
    throw e;
  }
  return out;
}

export async function gameCreateRoom(){
  await ensureSession();
  if(!session?.access_token) throw new Error("Please login first");
  const r = await fetch(functionsBase + "/create_game", { method: "POST", headers: authHeader() });
  let out = {};
  try { out = await r.json(); } catch {}
  if (!r.ok){
    const e = new Error(out?.error || r.statusText || "create_game failed");
    e.status = r.status; e.code = out?.error || out?.code || null; e.details = out;
    throw e;
  }
  try{
    const code = out?.game_code || out?.code;
    const pid = out?.participant_id;
    if (code && pid) localStorage.setItem("ms_pid_"+code, String(pid));
    if (code) localStorage.setItem("ms_last_host_code", String(code));
  }catch{}
  return { id: out?.game_id || out?.id || null, code: out?.game_code || out?.code || null, raw: out };
}

export async function gameJoinRoom({ code, name }){
  await ensureBoot();
  const headers = authHeader();
  const pid = localStorage.getItem("ms_pid_"+code);
  const body = pid ? { code, participant_id: pid } : { code, name: (name||null) };
  const r = await fetch(functionsBase + "/join_game_guest", { method: "POST", headers, body: JSON.stringify(body) });
  const out = await r.json().catch(()=>({}));
  if (!r.ok){
    const e = new Error(out?.error || r.statusText || "join_game_guest failed");
    e.status = r.status; e.code = out?.error || out?.code || null; e.details = out;
    throw e;
  }
  try{ const newPid = out?.participant_id; if (newPid) localStorage.setItem("ms_pid_"+code, String(newPid)); }catch{}
  return out;
}

export async function gameStart(codeOrId){
  await ensureSession();
  const { gameId } = await resolveGameId(codeOrId);
  const r = await fetch(functionsBase + "/start_game", { method: "POST", headers: authHeader(), body: JSON.stringify({ gameId }) });
  const out = await r.json().catch(()=>({}));
  if (!r.ok){ const e=new Error(out?.error||"start_game failed"); e.status=r.status; e.code=out?.error||out?.code||null; throw e; }
  return out;
}

export async function gameRevealNextCard(codeOrId){
  await ensureBoot();
  const { code, gameId } = await resolveGameId(codeOrId, true);
  const r = await fetch(functionsBase + "/next_question", {
    method: "POST",
    headers: { "content-type":"application/json" },
    body: JSON.stringify(gameId ? { gameId } : { code })
  });
  const out = await r.json().catch(()=>({}));
  if (!r.ok){ const e=new Error(out?.error||"next_question failed"); e.status=r.status; e.code=out?.error||out?.code||null; throw e; }
  return { text: out?.question?.text || out?.question_text || out?.text || "Next" };
}

export async function gameExtend(codeOrId){
  return { ok: true };
}

export async function gameEndAndAnalyze(codeOrId){
  await ensureSession();
  // Try resolve by id, then by code; if code-only, attempt fallback body { code } for backends that support it.
  const { code, gameId } = await resolveGameId(codeOrId, true);
  let body = {};
  if (gameId) body = { gameId };
  else if (code) {
    try {
      const st = await getStateByCode(code);
      if (st?.game_id) body = { gameId: st.game_id };
      else body = { code }; // fallback
    } catch {
      body = { code };
    }
  } else {
    throw new Error("Missing game identifier");
  }
  const r = await fetch(functionsBase + "/end_game_and_analyze", { method: "POST", headers: authHeader(), body: JSON.stringify(body) });
  const out = await r.json().catch(()=>({}));
  if (!r.ok){ const e=new Error(out?.error||"end_game_and_analyze failed"); e.status=r.status; e.code=out?.error||out?.code||null; throw e; }
  return out;
}

export async function gameSubmitAnswer({ sessionId, text }){
  await ensureBoot();
  const payload = {};
  if (sessionId && /^[A-Z0-9]{4,10}$/.test(String(sessionId))) payload.code = sessionId;
  else payload.gameId = sessionId;
  try{
    const code = payload.code;
    if (code){
      const pid = localStorage.getItem("ms_pid_"+code);
      if (pid) payload.participant_id = pid;
    }
  }catch{}
  payload.text = String(text||"");
  const r = await fetch(functionsBase + "/submit_answer", { method: "POST", headers: { "content-type":"application/json" }, body: JSON.stringify(payload) });
  const out = await r.json().catch(()=>({}));
  if (!r.ok){ const e=new Error(out?.error||"submit_answer failed"); e.status=r.status; e.code=out?.error||out?.code||null; throw e; }
  return out;
}

async function resolveGameId(codeOrId, allowCodeOnly=false){
  if (codeOrId && String(codeOrId).includes("-")) return { gameId: String(codeOrId) };
  const code = String(codeOrId||"").trim();
  if (code && !allowCodeOnly){
    const r = await fetch(functionsBase + "/get_state?code=" + encodeURIComponent(code));
    const out = await r.json().catch(()=>({}));
    const gid = out?.game_id || out?.game?.id;
    if (gid) return { code, gameId: gid };
  }
  return { code: code || null, gameId: null };
}

// Export names used by pages
export const login = authLogin;
export const register = authRegister;
export const sendReset = authSendReset;
export const resetPassword = authResetPassword;
export const getProfile = profileGet;
export const updateProfile = profileUpdate;
export const signOut = authSignOut;
export const createRoom = gameCreateRoom;
export const joinRoom = gameJoinRoom;
export const startGame = gameStart;
export const revealNextCard = gameRevealNextCard;
export const submitAnswer = gameSubmitAnswer;
export const extendGame = gameExtend;
export const endAndAnalyze = gameEndAndAnalyze;
export const sendFullReport = async ({ sessionId })=>({ ok: true });
