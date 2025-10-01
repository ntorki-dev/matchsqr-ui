// supabase-lite.js
(function(){
  const C = window.CONFIG||{};
  const url = C.FALLBACK_SUPABASE_URL;
  const anon = C.FALLBACK_SUPABASE_ANON_KEY;
  if (!url || !anon){
    console.warn("Supabase URL or anon key not set. Set them in config.js");
  }
  window.sb = window.supabase ? window.supabase.createClient(url, anon) : null;

  async function getAccessToken(){
    if (!window.sb) return null;
    const { data } = await window.sb.auth.getSession();
    return data && data.session ? data.session.access_token : null;
  }

  function base(){ return (C.FUNCTIONS_BASE||'').replace(/\/$/,''); }
  async function call(path, opts){
    const token = await getAccessToken();
    const url = base() + path;
    const headers = Object.assign({ 'content-type':'application/json' }, (opts && opts.headers)||{});
    if (token) headers['authorization'] = 'Bearer ' + token;
    const res = await fetch(url, Object.assign({ method:'POST', headers }, opts||{}));
    const text = await res.text();
    let out = null; try { out = JSON.parse(text); } catch(e){ out = { raw:text }; }
    if (!res.ok) throw Object.assign(new Error('HTTP '+res.status), { status: res.status, body: out });
    return out;
  }

  window.msAuth = {
    async login(email, password){
      if (!window.sb) throw new Error("Supabase not initialized");
      const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    async register(email, password){
      if (!window.sb) throw new Error("Supabase not initialized");
      const { data, error } = await window.sb.auth.signUp({ email, password });
      if (error) throw error;
      return data;
    },
    async logout(){
      if (!window.sb) return;
      await window.sb.auth.signOut();
    },
    async session(){
      if (!window.sb) return null;
      const { data } = await window.sb.auth.getSession();
      return data.session || null;
    }
  };

  window.msApi = {
    createGame: ()=>call('/create_game'),
    joinGameGuest: (body)=>call('/join_game_guest', { body: JSON.stringify(body) }),
    getState: (body)=>call('/get_state', { body: JSON.stringify(body||{}) }),
    startGame: (body)=>call('/start_game', { body: JSON.stringify(body) }),
    nextQuestion: (body)=>call('/next_question', { body: JSON.stringify(body) }),
    submitAnswer: (body)=>call('/submit_answer', { body: JSON.stringify(body) }),
    endGameAndAnalyze: (body)=>call('/end_game_and_analyze', { body: JSON.stringify(body) })
  };
})();
