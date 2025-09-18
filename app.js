// app.js — full file with realtime on `games` row and robust button wiring
// Assumes window.CONFIG = { SUPABASE_URL, SUPABASE_ANON_KEY, FUNCTIONS_BASE }

(() => {
  const byId = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  const safeJSON = async (res) => { try { return await res.json(); } catch { return null; } };
  const http = async (path, body=null, method="POST") => {
    const base = (window.CONFIG && window.CONFIG.FUNCTIONS_BASE ? window.CONFIG.FUNCTIONS_BASE : "").replace(/\/+$/,"/");
    const url = base + path.replace(/^\/+/, "");
    const init = { method, headers: { "Content-Type": "application/json" } };
    if (method === "GET" && body) {
      const q = new URLSearchParams(body).toString();
      return await fetch(url + (q ? "?" + q : ""), { method: "GET" });
    }
    if (body) init.body = JSON.stringify(body);
    return await fetch(url, init);
  };

  let supabaseClient = null;
  async function ensureSupabase() {
    if (supabaseClient) return supabaseClient;
    if (!window.CONFIG || !window.CONFIG.SUPABASE_URL || !window.CONFIG.SUPABASE_ANON_KEY) {
      // Do not throw; allow UI to bind so buttons still work for non-realtime flows
      console.warn("Supabase config missing in window.CONFIG. Realtime will be disabled.");
      return null;
    }
    if (!window.__createSupabaseClient) {
      await import("https://esm.sh/@supabase/supabase-js@2.45.4").then((m)=>{
        window.__createSupabaseClient = m.createClient;
      });
    }
    supabaseClient = window.__createSupabaseClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true },
      realtime: { params: { eventsPerSecond: 20 } }
    });
    return supabaseClient;
  }

  const AppState = {
    gameId: null,
    code: null,
    status: null,
    level: null,
    endsAt: null,
    participants: [],
    question: null,
    _timerRAF: null,
    _timerTarget: null,
    _gameChannel: null,
    _pollHandle: null,
  };

  // ---- Rendering ----
  const renderParticipants = (list) => {
    AppState.participants = Array.isArray(list) ? list : [];
    const sorted = [...AppState.participants].sort((a,b)=>{
      const ai = a.seat_index ?? 99999;
      const bi = b.seat_index ?? 99999;
      if (ai !== bi) return ai - bi;
      const an = (a.name||"").toLowerCase();
      const bn = (b.name||"").toLowerCase();
      if (an<bn) return -1; if (an>bn) return 1;
      return String(a.id).localeCompare(String(b.id));
    });
    const ul = byId("participantsList") || qs("[data-participants]") || byId("participants");
    if (ul) {
      ul.innerHTML = sorted.map(p => {
        const seat = p.seat_index != null ? ` <span class="seat">#${p.seat_index}</span>` : "";
        return `<li data-participant-id="${escapeHtml(p.id)}"><span class="name">${escapeHtml(p.name||"")}</span> <span class="role">${escapeHtml(p.role||"")}</span>${seat}</li>`;
      }).join("");
    }
  };

  const renderQuestion = (q) => {
    AppState.question = q || null;
    const qEl = byId("questionText") || qs("[data-question]") || byId("question");
    const hEl = byId("hintText") || qs("[data-hint]") || byId("hint");
    if (qEl) qEl.textContent = q && q.text ? q.text : "";
    if (hEl) hEl.textContent = q && q.clarification ? q.clarification : "";
  };

  const renderStatus = () => {
    const st = byId("statusText") || qs("[data-status]") || byId("status");
    if (st) st.textContent = AppState.status || "";
    const lvl = byId("levelText") || qs("[data-level]") || byId("level");
    if (lvl) lvl.textContent = AppState.level || "";
    const c = byId("gameCode") || qs("[data-game-code]") || byId("code");
    if (c) c.textContent = AppState.code || "";
  };

  // ---- Timer ----
  const stopTimer = () => {
    if (AppState._timerRAF) cancelAnimationFrame(AppState._timerRAF);
    AppState._timerRAF = null;
    AppState._timerTarget = null;
    paintTimer(0);
  };
  const startTimer = (iso) => {
    AppState.endsAt = iso || null;
    if (!iso) return stopTimer();
    AppState._timerTarget = new Date(iso);
    const tick = () => {
      const msLeft = AppState._timerTarget.getTime() - Date.now();
      paintTimer(msLeft);
      if (msLeft <= 0) { stopTimer(); return; }
      AppState._timerRAF = requestAnimationFrame(tick);
    };
    stopTimer();
    AppState._timerRAF = requestAnimationFrame(tick);
  };
  const maybeResyncTimer = (iso) => {
    if (!iso || !AppState._timerTarget) return;
    const target = new Date(iso).getTime();
    const delta = Math.abs(target - AppState._timerTarget.getTime());
    if (delta > 1000) startTimer(iso);
  };
  const paintTimer = (ms) => {
    const tEl = byId("timer") || qs("[data-timer]");
    if (!tEl) return;
    const s = Math.max(0, Math.floor(ms/1000));
    const mm = Math.floor((s % 3600)/60);
    const ss = s % 60;
    tEl.textContent = `${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  };

  // ---- API ----
  const api = {
    async createGame(payload) {
      const res = await http("create_game", payload || {});
      const data = await safeJSON(res);
      if (!res.ok) throw new Error(data?.error || "create_game failed");
      AppState.gameId = data.game_id || data.id || AppState.gameId;
      AppState.code   = data.code || AppState.code;
      AppState.status = data.status || AppState.status;
      AppState.level  = data.level  || AppState.level;
      renderStatus();
      return data;
    },
    async joinGuest({ code, name, role }) {
      const res = await http("join_game_guest", { code, name, role });
      const data = await safeJSON(res);
      if (!res.ok) throw new Error(data?.error || "join_game_guest failed");
      return data;
    },
    async startGame({ gameId }) {
      const res = await http("start_game", { gameId });
      const data = await safeJSON(res);
      if (!res.ok) throw new Error(data?.error || "start_game failed");
      AppState.status = data.status || AppState.status;
      AppState.level  = data.level  || AppState.level;
      startTimer(data.ends_at || null);
      renderStatus();
      return data;
    },
    async nextQuestion({ gameId }) {
      const res = await http("next_question", { gameId });
      const data = await safeJSON(res);
      if (!res.ok) throw new Error(data?.error || "next_question failed");
      refreshState();
      return data;
    },
    async getState({ gameId, code }) {
      const res = await http("get_state", { gameId, code });
      const data = await safeJSON(res);
      if (!res.ok) throw new Error(data?.error || "get_state failed");
      AppState.gameId = data.game_id || AppState.gameId;
      AppState.status = data.status  || AppState.status;
      AppState.level  = data.level   || AppState.level;
      AppState.endsAt = data.ends_at || null;
      renderStatus();
      maybeResyncTimer(AppState.endsAt);
      renderQuestion(data.question || null);
      renderParticipants(data.participants || []);
      return data;
    }
  };

  // ---- Realtime on single `games` row (bumped by DB triggers on participants change) ----
  async function stopGameRealtime() {
    if (AppState._gameChannel) {
      try { await AppState._gameChannel.unsubscribe(); } catch {}
      AppState._gameChannel = null;
    }
  }

  async function startGameRealtime(gameId) {
    const client = await ensureSupabase();
    if (!client || !gameId) return;
    await stopGameRealtime();
    const ch = client.channel(`game:${gameId}`);
    ch.on("postgres_changes",
      { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` },
      () => { refreshState(); }
    );
    await ch.subscribe();
    AppState._gameChannel = ch;
    console.log("[Realtime] Subscribed to games row", gameId);
  }

  // ---- Polling fallback ----
  const setPolling = (mode) => {
    if (AppState._pollHandle) clearInterval(AppState._pollHandle);
    const ms = mode === "running" ? 5000 : 2000;
    AppState._pollHandle = setInterval(()=>{
      if (!AppState.gameId && !AppState.code) return;
      refreshState();
    }, ms);
  };

  const refreshState = async () => {
    try { await api.getState({ gameId: AppState.gameId, code: AppState.code }); }
    catch (e) { console.warn("get_state failed:", e.message); }
  };

  // ---- UI wiring (defensive) ----
  function wireJoin() {
    const joinBtn  = byId("joinBtn") || qs("[data-join-btn]");
    const joinForm = byId("joinForm") || qs("[data-join-form]");
    const codeInput = byId("joinCode") || qs("[name=code]") || qs("[data-join-code]") || byId("codeInput");
    const nameInput = byId("joinName") || qs("[name=name]") || qs("[data-join-name]") || byId("nameInput");
    const roleInput = byId("joinRole") || qs("[name=role]") || qs("[data-join-role]");

    const handler = async (ev) => {
      if (ev && ev.preventDefault) ev.preventDefault();
      const code = (codeInput && codeInput.value) || AppState.code || "";
      const name = (nameInput && nameInput.value) || "";
      const role = (roleInput && roleInput.value) || "player";
      if (!code || !name) return alert("Enter code and name.");
      try {
        await api.joinGuest({ code, name, role });
        AppState.code = code;
        await refreshState();
        if (AppState.gameId) await startGameRealtime(AppState.gameId);
        setPolling(AppState.status === "running" ? "running" : "lobby");
      } catch (e) { alert("Join failed: " + e.message); }
    };

    if (joinBtn) joinBtn.addEventListener("click", handler);
    if (joinForm) joinForm.addEventListener("submit", handler);
  }

  function wireHost() {
    const createBtn = byId("createGameBtn") || byId("createBtn") || qs("[data-create-btn]");
    if (createBtn) {
      createBtn.addEventListener("click", async (ev) => {
        ev && ev.preventDefault && ev.preventDefault();
        try {
          const data = await api.createGame({});
          AppState.code   = data.code;
          AppState.gameId = data.game_id || data.id;
          await refreshState();
          if (AppState.gameId) await startGameRealtime(AppState.gameId);
          setPolling("lobby");
        } catch (e) { alert("Create game failed: " + e.message); }
      });
    }

    const startBtn = byId("startGameBtn") || byId("startBtn") || qs("[data-start-btn]");
    if (startBtn) {
      startBtn.addEventListener("click", async (ev) => {
        ev && ev.preventDefault && ev.preventDefault();
        if (!AppState.gameId) return alert("No game yet.");
        try {
          await api.startGame({ gameId: AppState.gameId });
          await refreshState();
          setPolling("running");
        } catch (e) { alert("Start game failed: " + e.message); }
      });
    }

    const revealBtn = byId("revealBtn") || byId("revealNextBtn") || qs("[data-reveal-btn]");
    if (revealBtn) {
      revealBtn.addEventListener("click", async (ev) => {
        ev && ev.preventDefault && ev.preventDefault();
        if (!AppState.gameId) return alert("No game yet.");
        try {
          await api.nextQuestion({ gameId: AppState.gameId });
        } catch (e) { alert("Next card failed: " + e.message); }
      });
    }
  }

  window.addEventListener("DOMContentLoaded", async () => {
    try {
      await ensureSupabase(); // non-fatal if CONFIG missing
    } catch (e) {
      console.warn("Supabase init warning:", e.message);
    }
    wireHost();
    wireJoin();
  });
})();
