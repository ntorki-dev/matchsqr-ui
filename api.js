// api.js
// Supabase client + HTTP helpers + storage helpers + API wrapper.
// Copied logically from original app.js to keep behavior intact.

const CONFIG = window.CONFIG || {};
export const FUNCTIONS_BASE = (CONFIG.FUNCTIONS_BASE || '').replace(/\/+$/,'');

// ---------- Global loader for user-triggered actions ----------
let __msActionLoaderCount = 0;

function withActionLoader(label, fn) {
  const show = window.msShowLoader;
  const hide = window.msHideLoader;

  // If loader is not wired, just run the action
  if (typeof show !== 'function' || typeof hide !== 'function') {
    return fn();
  }

  __msActionLoaderCount++;
  try { show(); } catch {}

  const finalize = () => {
    try {
      __msActionLoaderCount = Math.max(0, __msActionLoaderCount - 1);
      if (__msActionLoaderCount === 0) {
        hide();
      }
    } catch {}
  };

  let result;
  try {
    result = fn();
  } catch (err) {
    finalize();
    throw err;
  }

  // Handle both sync and async results
  if (!result || typeof result.then !== 'function') {
    finalize();
    return result;
  }

  return result.then(
    value => {
      finalize();
      return value;
    },
    err => {
      finalize();
      throw err;
    }
  );
}


// ---------- Supabase client and session ----------
export async function ensureClient(){
  if (window.__MS_CLIENT && window.__MS_CLIENT.auth && window.__MS_CLIENT.functions) return window.__MS_CLIENT;
  if (window.supabaseClient && window.supabaseClient.auth && window.supabaseClient.functions){ window.__MS_CLIENT = window.supabaseClient; return window.__MS_CLIENT; }
  if (window.supabase && window.supabase.auth && window.supabase.functions && window.supabase.from){ window.__MS_CLIENT = window.supabase; return window.__MS_CLIENT; }
  if (!window.supabase || !window.supabase.createClient){ throw new Error('[MS] Supabase UMD not loaded before app.core'); }
  let url='', key='';
  try{ const res = await fetch(FUNCTIONS_BASE + '/config'); if(res.ok){ const j=await res.json(); url=j.supabase_url||url; key=j.supabase_anon_key||key; } }catch(_){}
  url = url || CONFIG.SUPABASE_URL || '';
  key = key || CONFIG.SUPABASE_ANON_KEY || '';
  if (!url || !key) throw new Error('[MS] Missing Supabase URL/Key. Ensure /config or config.js provides them.');
  const client = window.supabase.createClient(url, key, { auth: { storageKey: 'ms-auth' } });
  window.__MS_CLIENT = client; window.supabaseClient = client; return client;
}

export async function getSession(){ const sb=await ensureClient(); const { data } = await sb.auth.getSession(); return (data&&data.session)||null; }
function authHeader(session){ const token=session?.access_token||''; return token?{Authorization:`Bearer ${token}`}:{ }; }

// ---------- Storage helpers ----------
export const AR = 'active_room';
export function msPidKey(code){ return `ms_pid_${code}`; }
export function msGidKey(code){ return `ms_gid_${code}`; }
export function msRoleKey(code){ return `ms_role_${code}`; }
export const draftKey = (code)=>`ms_draft_${code}`;
export const hostMarkerKey = (code)=>`__host_for_code_${code}`;

export function storedRoom(){ try{ return JSON.parse(localStorage.getItem(AR) || sessionStorage.getItem(AR) || 'null') || {}; }catch{return {};} }
export function saveActiveRoom(obj){
  const code = obj?.code || obj?.game_code || obj?.room_code || obj?.id;
  const id = obj?.id || obj?.game_id || obj?.room_id;
  const toSave = { ...(storedRoom()||{}), ...obj, code, id };
  localStorage.setItem(AR, JSON.stringify(toSave));
  if (code && id){ try{ localStorage.setItem(msGidKey(code), JSON.stringify(id)); }catch{} }
  if (code && obj?.participant_id){ try{ localStorage.setItem(msPidKey(code), JSON.stringify(obj.participant_id)); }catch{} }
}
export function resolveCode(explicit){
  if (explicit) return explicit;
  const m = (location.hash||'').match(/^#\/game\/([^?]+)/);
  if (m) return m[1];
  const ar = storedRoom();
  return ar.code || ar.game_code || ar.room_code || null;
}
export function resolveGameId(explicit){
  if (explicit) return explicit;
  const code = resolveCode(null);
  if (!code){ const ar=storedRoom(); return ar.id || ar.game_id || null; }
  try{ return JSON.parse(localStorage.getItem(msGidKey(code))||'null') || storedRoom().id || storedRoom().game_id || null; }catch{return storedRoom().id||storedRoom().game_id||null;}
}
export function setRole(code, role){ if(code && role) try{ localStorage.setItem(msRoleKey(code), role); }catch{} }
export function getRole(code){ try{ return localStorage.getItem(msRoleKey(code)) || ''; }catch{ return ''; } }

// ---------- HTTP helpers ----------
export async function jpost(path, body){
  const session = await getSession();
  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeader(session) }, body: body? JSON.stringify(body): undefined });
  const text = await res.text(); let json=null; try{ json=text?JSON.parse(text):null; }catch{}
  if(!res.ok){ const e=new Error((json&&(json.message||json.error))||text||'Request failed'); e.status=res.status; e.data=json; throw e; }
  return json;
}
export async function jget(pathWithQuery){
  const session = await getSession();
  const res = await fetch(`${FUNCTIONS_BASE}/${pathWithQuery}`, { headers: { ...authHeader(session) } });
  const text=await res.text(); let json=null; try{ json=text?JSON.parse(text):null; }catch{}
  if(!res.ok){ const e=new Error((json&&(json.message||json.error))||text||'Request failed'); e.status=res.status; e.data=json; throw e; }
  return json;
}

// ---------- API wrappers ----------
export const API = {
    create_game(){
    return withActionLoader('create_game', () => jpost('create_game', null));
  },
  get_state(p){ const code=resolveCode(p?.code); if(!code) throw new Error('Missing code'); return jget(`get_state?code=${encodeURIComponent(code)}`); },
    join_game_guest(p){
    const code = resolveCode(p?.code) || p?.code;
    if (!code) throw new Error('Missing code');
    const nickname = p?.nickname || p?.name || '';
    const existingPid = localStorage.getItem(msPidKey(code));
    const body = existingPid ? { code, participant_id: JSON.parse(existingPid) } : { code };
    if (nickname){ body.name = nickname; body.nickname = nickname; }

    return withActionLoader('join_game_guest', () =>
      jpost('join_game_guest', body).then(data => {
        const gid = data?.game_id || null;
        const pid = data?.participant_id || null;
        if (gid) try{ localStorage.setItem(msGidKey(code), JSON.stringify(gid)); }catch{}
        if (pid) try{ localStorage.setItem(msPidKey(code), JSON.stringify(pid)); }catch{}
        saveActiveRoom({ code, id: gid, participant_id: pid });
        if (data?.is_host) setRole(code,'host'); else setRole(code,'guest');
        return data;
      })
    );
  },

    start_game(){
    const code = resolveCode(null);
    const gid  = resolveGameId(null);
    if (!code && !gid) throw new Error('Missing game id/code');
    return withActionLoader('start_game', () =>
      jpost('start_game', { code, gameId: gid, id: gid })
    );
  },

    next_question(opts){
  const code = resolveCode(null);
  const gid  = resolveGameId(null);
  if (!code && !gid) throw new Error('Missing game id/code');

  const payload = { code, gameId: gid, id: gid };

  if (opts && (opts.mode === 'auto' || opts.mode === 'manual')) {
    payload.mode = opts.mode;
  }

  if (opts && (opts.level === 'simple' || opts.level === 'medium' || opts.level === 'deep')) {
    payload.level = opts.level;
  }

  return withActionLoader('next_question', () =>
    jpost('next_question', payload)
  );
},


    end_game_and_analyze(){
    const code = resolveCode(null);
    const gid  = resolveGameId(null);
    if (!code && !gid) throw new Error('Missing game id/code');
    return withActionLoader('end_game_and_analyze', () =>
      jpost('end_game_and_analyze', { code, gameId: gid, id: gid })
    );
  },

  heartbeat(){ const gid=resolveGameId(null); const code=resolveCode(null); if(!gid && !code) return Promise.resolve({skipped:true}); return jpost('heartbeat', { code, gameId: gid, id: gid }); },
  participant_heartbeat(){
    const code=resolveCode(null); const gid=resolveGameId(null);
    if (!code || !gid) return Promise.resolve({skipped:true});
    const pidRaw = localStorage.getItem(msPidKey(code)); if (!pidRaw) return Promise.resolve({skipped:true});
    const pid = JSON.parse(pidRaw);
    return jpost('participant_heartbeat', { code, gameId: gid, id: gid, participant_id: pid });
  },
           submit_answer(p){
    const code   = resolveCode(null);
    const gid    = resolveGameId(null);
    const pidRaw = code ? localStorage.getItem(msPidKey(code)) : null;
    const pid    = pidRaw ? JSON.parse(pidRaw) : undefined;
    const body   = { code, game_id: gid, id: gid, text: p?.text || p?.answer || '', participant_id: pid };

    return withActionLoader('submit_answer', () =>
      jpost('submit_answer', body)
    );
  },


   // Entitlement or billing helper
   entitlement_check(payload){
    return withActionLoader('entitlement_check', () =>
      jpost('entitlement_check', payload || {})
    );
  },


  // Extend the current game by 60 minutes (host only)
    extend_game(payload){
    return withActionLoader('extend_game', () =>
      jpost('extend_game', payload || {})
    );
  },

  // Move current game from running to grace when time is up (host only)
  enter_grace(payload){
    const code = resolveCode(payload && payload.code);
    const gid  = resolveGameId(null);
    if (!code && !gid) throw new Error('Missing game id/code');
    return withActionLoader('enter_grace', () =>
      jpost('enter_grace', { code, gameId: gid, id: gid })
    );
  }
};



// ---------- Host inference shared ----------
export async function inferAndPersistHostRole(code, state){
  try{
    if (!code || !state) return;
    const sess = await getSession();
    const meId = sess?.user?.id || null;
    if (state.is_host === true) { setRole(code,'host'); return; }
    const hostId = state?.host_user_id || state?.hostId || state?.host?.id || null;
    if (meId && hostId && String(meId)===String(hostId)) { setRole(code,'host'); return; }
    const ppl = Array.isArray(state.participants)? state.participants : (Array.isArray(state.players)? state.players : []);
    if (ppl && ppl.length){
      for (const p of ppl){
        const isHost = p?.is_host || p?.role==='host';
        const u1 = p?.user_id || p?.auth_user_id || p?.owner_id || p?.uid;
        if (isHost && meId && u1 && String(meId)===String(u1)){ setRole(code,'host'); return; }
      }
    }
  }catch{}
}

// ---- Profiles helper (surgical) ----
export async function getProfileName(userId){
  const sb = await ensureClient();
  try{
    const uid = userId;
    if (!uid) return null;
    const { data, error } = await sb.from('profiles').select('name').eq('id', uid).single();
    if (error) return null;
    return data?.name || null;
  }catch(_){ return null; }
}


// ---- Batch profiles helper ----
export async function getProfileNames(userIds){
  const sb = await ensureClient();
  try{
    const ids = Array.from(new Set((userIds||[]).filter(Boolean)));
    if (ids.length === 0) return {};
    const { data, error } = await sb.from('profiles').select('id, name').in('id', ids);
    if (error) return {};
    const map = {};
    for (const row of data || []) { if (row && row.id) map[row.id] = row.name || null; }
    return map;
  }catch(_){ return {}; }
}
