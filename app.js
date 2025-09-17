/* app.js, full file
   Works with:
   - get_state: GET or POST, accepts code or game_id
   - join_game_guest: GET or POST, accepts name and code or game_id
   - start_game: GET or POST, accepts code or game_id
   - participant_heartbeat: POST JSON
   - heartbeat: POST JSON
   - create_game: assumed to exist, returns { game: { id, code }, participant?: { id } } or similar
*/

(() => {
  // Read functions base from config.js if provided, else default guess
  const FUNCTIONS_BASE = (window.CONFIG && window.CONFIG.FUNCTIONS_BASE) || "/functions/v1";

  // Simple state
  const state = {
    mode: null,          // "host" or "guest"
    gameId: null,
    code: null,
    participantId: null, // for guest, and possibly host if your backend returns it
    pollTimer: null,
    hbTimer: null,
  };

  // Helpers
  const $ = (id) => document.getElementById(id);
  function showToast(msg, ok = false) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    t.style.background = ok ? "#0a7a2f" : "#111";
    setTimeout(() => t.classList.remove("show"), 1800);
  }
  function setTop(msg) {
    $("topStatus").textContent = msg || "";
  }
  function showScreen(id) {
    ["screenHome", "screenHost", "screenJoin"].forEach((sid) => {
      $(sid).classList.toggle("hidden", sid !== id);
    });
  }
  function stopLoops() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    if (state.hbTimer) clearInterval(state.hbTimer);
    state.pollTimer = null;
    state.hbTimer = null;
  }

  async function fetchJSON(url, opts = {}) {
    try {
      const r = await fetch(url, opts);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      return data;
    } catch (e) {
      throw e;
    }
  }

  // API wrappers
  async function apiCreateGame() {
    // Try POST first, then fallback to GET
    let data;
    try {
      data = await fetchJSON(`${FUNCTIONS_BASE}/create_game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      data = await fetchJSON(`${FUNCTIONS_BASE}/create_game`);
    }
    // Normalize
    const game = data.game || data?.data || data || {};
    const gameId = game.id || data.game_id || data.id;
    const code = game.code || data.code;
    const participant = data.participant || null;
    return { gameId, code, participantId: participant?.id || null };
  }

  async function apiGetState({ gameId, code }) {
    let url = `${FUNCTIONS_BASE}/get_state`;
    const qp = [];
    if (gameId) qp.push(`game_id=${encodeURIComponent(gameId)}`);
    if (code) qp.push(`code=${encodeURIComponent(code)}`);
    if (qp.length) url += "
