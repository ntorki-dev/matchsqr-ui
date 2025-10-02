// api-adapter.js — mapped to your backend, with state helpers
let supa = null;
let session = null;
let functionsBase = null;

function setLS(k,v){ try{ localStorage.setItem(k, v) }catch{} }
function getLS(k){ try{ return localStorage.getItem(k) }catch{ return null } }
function delLS(k){ try{ localStorage.removeItem(k) }catch{} }

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

// ===== Public helper: state =====
export function getCurrentContext(){
  return {
    code: getLS("ms_current_code"),
    gameId: getLS("ms_current_game_id"),
    pid: getLS("ms_pid_"+(getLS("ms_current_code")||"") )
  };
}
export function setCurrentContext({ code=null, gameId=null }){
  if (code) setLS("ms_current_code", String(code));
  if (gameId) setLS("ms_current_game_id", String(gameId));
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
  delLS("ms_current_code"); delLS("ms_current_game_id");
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

export async function getState(code){
  await ensureBoot();
  const r = await fetch(functionsBase + "/get_state?code=" + encodeURIComponent(code));
  const out = await r.json().catch(()=>({}));
  if (!r.ok){
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
    const gid = out?.game_id || out?.id || null;
    if (code && pid) setLS("ms_pid_"+code, String(pid));
    if (code) setLS("ms_last_host_code", String(code));
    if (code) setCurrentContext({ code });
    if (gid) setCurrentContext({ gameId: gid });
  }catch{}
  return { id: out?.game_id || out?.id || null, code: out?.game_code || out?.code || null, raw: out };
}

export async function gameJoinRoom({ code, name }){
  await ensureBoot();
  const headers = authHeader();
  const pid = getLS("ms_pid_"+code);
  const body = pid ? { code, participant_id: pid } : { code, name: (name||null) };
  const r = await fetch(functionsBase + "/join_game_guest", { method: "POST", headers, body: JSON.stringify(body) });
  const out = await r.json().catch(()=>({}));
  if (!r.ok){
    const e = new Error(out?.error || r.statusText || "join_game_guest failed");
    e.status = r.status; e.code = out?.error || out?.code || null; e.details = out;
    throw e;
  }
  try{
    const newPid = out?.participant_id;
    if (newPid) setLS("ms_pid_"+code, String(newPid));
    setCurrentContext({ code });
    // Try to fetch gameId immediately for later host/guest actions
    try{ const st = await getState(code); if(st?.game_id) setCurrentContext({ gameId: st.game_id }); }catch{}
  }catch{}
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
  const { code, gameId } = await resolveGameId(codeOrId, true);
  let gid = gameId;
  if (!gid && code){
    try{ const st = await getState(code); gid = st?.game_id || null; }catch{}
  }
  const body = gid ? { gameId: gid } : (code ? { code } : null);
  if(!body) throw new Error("Missing game identifier");
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
      const pid = getLS("ms_pid_"+code);
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
  // Prefer stored context
  const ctx = getCurrentContext();
  if (!codeOrId){
    return { code: ctx.code || null, gameId: ctx.gameId || null };
  }

  if (codeOrId && String(codeOrId).includes("-")) return { gameId: String(codeOrId) };

  const code = String(codeOrId||"").trim();
  // If we have it stored, use it
  if (ctx.code === code && ctx.gameId) return { code, gameId: ctx.gameId };

  if (code && !allowCodeOnly){
    const st = await getState(code);
    const gid = st?.game_id || st?.game?.id;
    if (gid){
      setCurrentContext({ code, gameId: gid });
      return { code, gameId: gid };
    }
  }
  return { code: code || ctx.code || null, gameId: ctx.gameId || null };
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
