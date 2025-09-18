// app.js — robust wiring for Join flow + realtime participants + smooth timer + command-style next_question
// Assumes window.CONFIG with SUPABASE_URL, SUPABASE_ANON_KEY, FUNCTIONS_BASE.
// No HTML changes required; supports multiple common element IDs/data-attributes.

(() => {
  // ---------- Helpers ----------
  const byId = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));
  const fmt2 = (n) => String(n).padStart(2, "0");

  const log = (msg) => {
    console.log("[MatchSquare]", msg);
    const el = byId("log") || qs("[data-log]");
    if (el) {
      const p = document.createElement("div");
      p.textContent = String(msg);
      el.appendChild(p);
      // keep last 20 lines
      while (el.childNodes.length > 20) el.removeChild(el.firstChild);
    }
  };

  const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",""":"&quot;","'":"&#39;" }[m]));

  // ---------- HTTP ----------
  const safeJSON = async (res) => { try { return await res.json(); } catch { return null; } };
  const http = async (path, body=null, method="POST") => {
    const base = (window.CONFIG && window.CONFIG.FUNCTIONS_BASE ? window.CONFIG.FUNCTIONS_BASE : "").replace(/\/+$/,"/");
    const url = base + path.replace(/^\/+/, "");
    const init = { method, headers: { "Content-Type": "application/json" } };
    if (method === "GET") {
      const q = body && typeof body === "object" ? new URLSearchParams(body).toString() : "";
      log(`GET ${url}${q ? "?" + q : ""}`);
      return await fetch(url + (q ? "?" + q : ""), { method: "GET" });
    } else {
      init.body = body ? JSON.stringify(body) : "{}";
      log(`${method} ${url} :: ${init.body}`);
      return await fetch(url, init);
    }
  };

  // ---------- Supabase ----------
  const ensureSupabase = async () => {
    if (window.supabase) return window.supabase;
    if (!window.CONFIG || !window.CONFIG.SUPABASE_URL || !window.CONFIG.SUPABASE_ANON_KEY) {
      throw new Error("Supabase not configured. Ensure config.js sets window.CONFIG.");
    }
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
    endsAt: null,
    participants: [],
    question: null,
    _timerRAF: null,
    _timerTarget: null,
    _channel: null,
    _pollHandle: null,
  };

  // ---------- Renderers ----------
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
    if (!ul) return;
    ul.innerHTML = sorted.map(p => {
      const seat = p.seat_index != null ? ` <span class="seat">#${p.seat_index}</span>` : "";
      return `<li data-participant-id="${escapeHtml(p.id)}"><span class="name">${escapeHtml(p.name||"")}</span> <span class="role">${escapeHtml(p.role||"")}</span>${seat}</li>`;
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
    const c = byId("gameCode") || qs("[data-game-code]") || byId("code");
    if (c) c.textContent = AppState.code || "";
  };

  // ---------- Timer ----------
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
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600)/60);
    const ss = s % 60;
    tEl.textContent = hh > 0 ? `${fmt2(hh)}:${fmt2(mm)}:${fmt2(ss)}` : `${fmt2(mm)}:${fmt2(ss)}`;
  };

  // ---------- API ----------
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
      // Command-style: do not render from response. Refresh state to show new card.
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
      renderParticipants(Array.isArray(data.participants) ? data.participants : []);
      return data;
    }
  };

  // ---------- Realtime ----------
  const subscribeParticipants = async (gameId) => {
    const client = await ensureSupabase();
    if (AppState._channel) {
      try { await AppState._channel.unsubscribe(); } catch {}
      AppState._channel = null;
    }
    const ch = client.channel(`participants:game_${gameId}`);
    ch.on("postgres_changes",
      { event: "*", schema: "public", table: "participants", filter: `game_id=eq.${gameId}` },
      () => { log("Realtime: participants changed, refreshing state."); refreshState(); }
    );
    await ch.subscribe((status)=>log("Realtime status: " + status));
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

  const refreshState = async () => {
    try { await api.getState({ gameId: AppState.gameId, code: AppState.code }); }
    catch (e) { log("get_state failed: " + e.message); }
  };

  // ---------- UI Wiring: robust join handling ----------
  const wireJoin = () => {
    // Buttons and forms that might exist
    const joinForm = byId("joinForm") || qs("[data-join-form]");
    const joinBtn  = byId("joinBtn") || qs("[data-join-btn]") || (joinForm ? joinForm.querySelector("button[type=submit]") : null);
    const codeInput = byId("joinCode") || qs("[name=code]") || qs("[data-join-code]") || byId("codeInput");
    const nameInput = byId("joinName") || qs("[name=name]") || qs("[data-join-name]") || byId("nameInput");
    const roleInput = byId("joinRole") || qs("[name=role]") || qs("[data-join-role]");

    const handler = async (ev) => {
      if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
      const code = (codeInput && codeInput.value) || AppState.code || "";
      const name = (nameInput && nameInput.value) || "";
      const role = (roleInput && roleInput.value) || "player";
      if (!code || !name) { alert("Enter code and name."); return; }
      try {
        await api.joinGuest({ code, name, role });
        AppState.code = code;
        await resolveGameIdFromCode();
        await refreshState();
        if (AppState.gameId) await subscribeParticipants(AppState.gameId);
        setPolling(AppState.status === "running" ? "running" : "lobby");
        log("Join successful.");
      } catch (e) {
        alert("Join failed: " + e.message);
        log("Join failed: " + e.message);
      }
    };

    if (joinForm) joinForm.addEventListener("submit", handler);
    if (joinBtn)  joinBtn.addEventListener("click", handler);
  };

  const wireHostButtons = () => {
    const createBtn = byId("createGameBtn") || byId("createBtn") || qs("[data-create-btn]");
    if (createBtn) {
      createBtn.addEventListener("click", async (ev) => {
        ev && ev.preventDefault && ev.preventDefault();
        try {
          const data = await api.createGame({});
          AppState.code   = data.code || AppState.code;
          AppState.gameId = data.game_id || data.id || AppState.gameId;
          await refreshState();
          if (AppState.gameId) await subscribeParticipants(AppState.gameId);
          setPolling("lobby");
        } catch (e) { alert("Create game failed: " + e.message); log(e); }
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
        } catch (e) { alert("Start game failed: " + e.message); log(e); }
      });
    }

    const revealBtn = byId("revealBtn") || byId("revealNextBtn") || qs("[data-reveal-btn]");
    if (revealBtn) {
      revealBtn.addEventListener("click", async (ev) => {
        ev && ev.preventDefault && ev.preventDefault();
        if (!AppState.gameId) return alert("No game yet.");
        try {
          await api.nextQuestion({ gameId: AppState.gameId });
          // UI updates on get_state via refreshState(), which is called right after command
        } catch (e) { alert("Next card failed: " + e.message); log(e); }
      });
    }
  };

  const resolveGameIdFromCode = async () => {
    if (AppState.gameId || !AppState.code) return;
    try {
      const res = await api.getState({ code: AppState.code });
      AppState.gameId = res.game_id || AppState.gameId;
      if (AppState.gameId) await subscribeParticipants(AppState.gameId);
    } catch (e) {
      log("resolveGameIdFromCode failed: " + e.message);
    }
  };

  // ---------- Init ----------
  window.addEventListener("DOMContentLoaded", async () => {
    try {
      await ensureSupabase();
      wireJoin();
      wireHostButtons();

      // Support code in URL
      const url = new URL(window.location.href);
      const codeFromUrl = url.searchParams.get("code") || url.searchParams.get("room") || null;
      if (codeFromUrl) {
        AppState.code = codeFromUrl;
        await resolveGameIdFromCode();
        setPolling(AppState.status === "running" ? "running" : "lobby");
      }
    } catch (e) {
      log("App init failed: " + e.message);
      const warn = byId("warning") || qs("[data-warning]");
      if (warn) warn.textContent = "App init failed: " + e.message;
    }
  });
})();
