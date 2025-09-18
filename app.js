// app.js — consolidated client logic (realtime participants + smooth timer + command-style next_question)
// This file assumes window.CONFIG provides SUPABASE_URL, SUPABASE_ANON_KEY, and FUNCTIONS_BASE.
//
// It preserves your existing request/response shapes and does NOT require HTML changes.
// If an expected DOM element is missing, it will simply skip rendering that piece (no crashes).

(() => {
  // ---------- Utilities ----------
  const byId = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);

  const safeJSON = async (res) => {
    try { return await res.json(); } catch { return null; }
  };

  const http = async (path, body=null, method="POST") => {
    const url = (window.CONFIG && window.CONFIG.FUNCTIONS_BASE ? window.CONFIG.FUNCTIONS_BASE : "").replace(/\/+$/,"/") + path.replace(/^\/+/, "");
    const init = { method, headers: { "Content-Type": "application/json" } };
    if (body && method !== "GET") init.body = JSON.stringify(body);
    if (method === "GET" && body && typeof body === "object") {
      // attach query params
      const q = new URLSearchParams(body).toString();
      return await fetch(url + (q ? "?" + q : ""), { method: "GET" });
    }
    return await fetch(url, init);
  };

  const fmt2 = (n) => String(n).padStart(2, "0");

  // ---------- Supabase Client ----------
  const ensureSupabase = async () => {
    if (window.supabase) return window.supabase;
    if (!window.CONFIG || !window.CONFIG.SUPABASE_URL || !window.CONFIG.SUPABASE_ANON_KEY) {
      throw new Error("Supabase client not configured. Ensure config.js sets window.CONFIG.");
    }
    // Load supabase-js v2 as an ES module dynamically
    if (!window.__createSupabaseClient) {
      await import("https://esm.sh/@supabase/supabase-js@2.45.4").then((m)=>{
        window.__createSupabaseClient = m.createClient;
      });
    }
    const client = window.__createSupabaseClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true },
      realtime: { params: { eventsPerSecond: 20 } }
    });
    window.supabase = client;
    return client;
  };

  // ---------- App State ----------
  const AppState = {
    gameId: null,
    code: null,
    status: null,
    level: null,
    endsAt: null, // ISO string
    participants: [],
    question: null,
    _timerRAF: null,
    _timerTarget: null, // Date
    _channel: null,
    _pollHandle: null,
  };

  // ---------- Rendering ----------
  const renderParticipants = (list) => {
    AppState.participants = list || [];
    // Server already orders by seat_index; keep as-is. Fallback sort if needed:
    const sorted = [...AppState.participants].sort((a,b)=>{
      const ai = a.seat_index ?? 99999;
      const bi = b.seat_index ?? 99999;
      if (ai !== bi) return ai - bi;
      const an = (a.name||"").toLowerCase();
      const bn = (b.name||"").toLowerCase();
      if (an<bn) return -1; if (an>bn) return 1;
      return String(a.id).localeCompare(String(b.id));
    });

    // Try common containers
    const ul = byId("participantsList") || qs("[data-participants]") || byId("participants");
    if (!ul) return; // UI might have different structure; skip silently

    // Use innerHTML for simplicity
    ul.innerHTML = sorted.map(p => {
      const role = p.role || "";
      const seat = (p.seat_index ?? "") === "" ? "" : ` <span class="seat">#${p.seat_index}</span>`;
      return `<li data-participant-id="${p.id}"><span class="name">${escapeHtml(p.name || "")}</span> <span class="role">${escapeHtml(role)}</span>${seat}</li>`;
    }).join("");
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
    const codeEl = byId("gameCode") || qs("[data-game-code]") || byId("code");
    if (codeEl) codeEl.textContent = AppState.code || "";
  };

  // ---------- Timer (requestAnimationFrame + drift correction) ----------
  const stopTimer = () => {
    if (AppState._timerRAF) cancelAnimationFrame(AppState._timerRAF);
    AppState._timerRAF = null;
    AppState._timerTarget = null;
  };

  const startTimer = (iso) => {
    AppState.endsAt = iso || null;
    if (!iso) { stopTimer(); paintTimer(0); return; }
    AppState._timerTarget = new Date(iso);
    const tick = () => {
      const msLeft = AppState._timerTarget.getTime() - Date.now();
      paintTimer(msLeft);
      if (msLeft <= 0) { stopTimer(); paintTimer(0); return; }
      AppState._timerRAF = requestAnimationFrame(tick);
    };
    stopTimer();
    AppState._timerRAF = requestAnimationFrame(tick);
  };

  const paintTimer = (ms) => {
    const tEl = byId("timer") || qs("[data-timer]");
    if (!tEl) return;
    const s = Math.max(0, Math.floor(ms/1000));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600)/60);
    const ss = s % 60;
    if (hh > 0) tEl.textContent = `${fmt2(hh)}:${fmt2(mm)}:${fmt2(ss)}`;
    else tEl.textContent = `${fmt2(mm)}:${fmt2(ss)}`;
  };

  // On each state refresh, correct drift if |delta| > 1s
  const maybeResyncTimer = (iso) => {
    if (!iso || !AppState._timerTarget) return;
    const target = new Date(iso).getTime();
    const delta = Math.abs(target - AppState._timerTarget.getTime());
    if (delta > 1000) startTimer(iso);
  };

  // ---------- API calls (preserve existing shapes) ----------
  const api = {
    async createGame(payload) {
      const res = await http("create_game", payload || {});
      const data = await safeJSON(res);
      if (!res.ok) throw new Error(data && data.error || "create_game failed");
      // Expected fields: { game_id, code, status:'lobby', level, ends_at:null }
      AppState.gameId = data.game_id || data.id || AppState.gameId;
      AppState.code = data.code || AppState.code;
      AppState.status = data.status || AppState.status;
      AppState.level  = data.level  || AppState.level;
      renderStatus();
      return data;
    },
    async joinGuest({ code, name, role }) {
      const res = await http("join_game_guest", { code, name, role });
      const data = await safeJSON(res);
      if (!res.ok) throw new Error(data && data.error || "join_game_guest failed");
      return data;
    },
    async startGame({ gameId }) {
      const res = await http("start_game", { gameId });
      const data = await safeJSON(res);
      if (!res.ok) throw new Error(data && data.error || "start_game failed");
      // { ends_at, status:'running', level }
      AppState.status = data.status || AppState.status;
      AppState.level = data.level || AppState.level;
      startTimer(data.ends_at || null);
      renderStatus();
      return data;
    },
    async nextQuestion({ gameId }) {
      // Command-style: do not update UI from this response to avoid flicker
      const res = await http("next_question", { gameId });
      const data = await safeJSON(res);
      if (!res.ok) throw new Error(data && data.error || "next_question failed");
      // Trigger immediate refresh to pick up the new pointer
      refreshState();
      return data;
    },
    async getState({ gameId, code }) {
      // Prefer POST body with aliases supported by your function
      const res = await http("get_state", { gameId, code });
      const data = await safeJSON(res);
      if (!res.ok) throw new Error(data && data.error || "get_state failed");
      // { ok, game_id, status, level, ends_at, question, participants }
      AppState.gameId = data.game_id || AppState.gameId;
      AppState.status = data.status || AppState.status;
      AppState.level  = data.level || AppState.level;
      AppState.endsAt = data.ends_at || null;
      renderStatus();
      maybeResyncTimer(AppState.endsAt);
      renderQuestion(data.question || null);
      renderParticipants(Array.isArray(data.participants) ? data.participants : []);
      return data;
    }
  };

  // ---------- Realtime for participants (triggered read) ----------
  const subscribeParticipants = async (gameId) => {
    const client = await ensureSupabase();
    // Cleanup previous
    if (AppState._channel) {
      try { await AppState._channel.unsubscribe(); } catch {}
      AppState._channel = null;
    }
    const ch = client.channel(`participants:game_${gameId}`);
    ch.on("postgres_changes",
      { event: "*", schema: "public", table: "participants", filter: `game_id=eq.${gameId}` },
      () => { refreshState(); } // do not infer state, always read from source of truth
    );
    await ch.subscribe((status)=>{
      // Optionally, log or reflect status
    });
    AppState._channel = ch;
  };

  // ---------- Polling fallback ----------
  const setPolling = (mode /* 'lobby'|'running' */) => {
    if (AppState._pollHandle) clearInterval(AppState._pollHandle);
    const ms = mode === "running" ? 5000 : 2000;
    AppState._pollHandle = setInterval(()=>{
      if (!AppState.gameId && !AppState.code) return;
      refreshState();
    }, ms);
  };

  // ---------- Orchestration ----------
  const refreshState = async () => {
    try {
      await api.getState({ gameId: AppState.gameId, code: AppState.code });
    } catch (e) {
      console.warn("get_state failed:", e.message);
    }
  };

  // Exposed hooks for existing UI buttons (use the IDs you already have)
  const wireUI = () => {
    const createBtn = byId("createGameBtn") || byId("createBtn");
    if (createBtn) {
      createBtn.onclick = async () => {
        try {
          const data = await api.createGame({}); // adjust payload if needed
          AppState.code = data.code || AppState.code;
          AppState.gameId = data.game_id || data.id || AppState.gameId;
          renderStatus();
          await refreshState();
          if (AppState.gameId) await subscribeParticipants(AppState.gameId);
          setPolling("lobby");
        } catch (e) { alert("Create game failed: " + e.message); }
      };
    }

    const startBtn = byId("startGameBtn") || byId("startBtn");
    if (startBtn) {
      startBtn.onclick = async () => {
        if (!AppState.gameId) return alert("No game yet.");
        try {
          await api.startGame({ gameId: AppState.gameId });
          await refreshState();
          setPolling("running");
        } catch (e) { alert("Start game failed: " + e.message); }
      };
    }

    const revealBtn = byId("revealBtn") || byId("revealNextBtn");
    if (revealBtn) {
      revealBtn.onclick = async () => {
        if (!AppState.gameId) return alert("No game yet.");
        try {
          await api.nextQuestion({ gameId: AppState.gameId });
          // Do not render from response; state refresh will show the new card
        } catch (e) { alert("Next card failed: " + e.message); }
      };
    }

    // If your UI has join flow on the same page
    const joinBtn = byId("joinBtn");
    if (joinBtn) {
      joinBtn.onclick = async () => {
        const code = (byId("joinCode") || {}).value || AppState.code;
        const name = (byId("joinName") || {}).value || "";
        const role = (byId("joinRole") || {}).value || "player";
        if (!code || !name) return alert("Enter code and name.");
        try {
          await api.joinGuest({ code, name, role });
          AppState.code = code;
          await resolveGameIdFromCode(); // to subscribe realtime
          await refreshState();
          if (AppState.gameId) await subscribeParticipants(AppState.gameId);
          // poll according to server status
          setPolling(AppState.status === "running" ? "running" : "lobby");
        } catch (e) { alert("Join failed: " + e.message); }
      };
    }
  };

  const resolveGameIdFromCode = async () => {
    if (AppState.gameId || !AppState.code) return;
    // Use get_state by code to resolve id
    try {
      const res = await api.getState({ code: AppState.code });
      AppState.gameId = res.game_id || AppState.gameId;
      if (AppState.gameId) await subscribeParticipants(AppState.gameId);
    } catch {}
  };

  // ---------- Helpers ----------
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",""":"&quot;","'":"&#39;" }[m]));
  }

  // ---------- Init ----------
  window.addEventListener("load", async () => {
    try {
      await ensureSupabase();
      wireUI();
      // if code present in URL, auto-resolve and subscribe
      const url = new URL(window.location.href);
      const codeFromUrl = url.searchParams.get("code") || url.searchParams.get("room") || null;
      if (codeFromUrl) {
        AppState.code = codeFromUrl;
        await resolveGameIdFromCode();
        setPolling(AppState.status === "running" ? "running" : "lobby");
      } else {
        // default: try a light refresh if already have gameId
        if (AppState.gameId) {
          await subscribeParticipants(AppState.gameId);
          setPolling(AppState.status === "running" ? "running" : "lobby");
        }
      }
    } catch (e) {
      console.error(e);
      const warn = byId("warning") || qs("[data-warning]");
      if (warn) warn.textContent = "App init failed: " + e.message;
    }
  });
})();
