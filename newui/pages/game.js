import * as api from "../api-adapter.js";
import { navigate } from "../router.js";

function el(tag, attrs={}, html=""){
  const n = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)) n.setAttribute(k,v);
  if(html) n.innerHTML = html;
  return n;
}

async function ensureContext(routeId){
  // routeId is the code from /game/:id
  const ctx = api.getCurrentContext();
  let code = (routeId || "").trim() || ctx.code || "";
  let gameId = ctx.gameId || null;

  // Try to resolve gameId if missing
  if (code && !gameId){
    try{
      const st = await api.getState(code);
      gameId = st?.game_id || st?.game?.id || null;
      api.setCurrentContext({ code, gameId });
    }catch{}
  }
  return { code, gameId };
}

export async function render({ params }){
  const top = el("div", { class: "ms-card" });
  const header = el("div", {}, `<h2>Game</h2><p class="meta">Interact through prompts and messages.</p>`);
  top.appendChild(header);

  // Determine role: logged-in => host, otherwise guest
  const isHost = await api.isLoggedIn().catch(()=>false);

  // Resolve context (code + id)
  const { code, gameId } = await ensureContext(params.id);

  // Controls container
  const controls = el("div", { class:"ms-actions", id:"hostControls" });
  controls.innerHTML = `
    <button id="start" class="ms-btn primary">Start</button>
    <button id="reveal" class="ms-btn">Reveal next</button>
    <button id="extend" class="ms-btn">Extend</button>
    <button id="end" class="ms-btn">End &amp; analyze</button>
  `;
  if (!isHost) controls.style.display = "none"; // hide host-only controls for guests
  top.appendChild(controls);

  // Card area
  const card = el("div", { class:"ms-card", style:"background:#0d0f15;border:1px dashed #1f2026;" });
  card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div id="levelDot" style="width:10px;height:10px;border-radius:999px;background:#4caf50"></div>
      <div class="ms-row" style="gap:8px">
        <button id="clarify" class="ms-btn" title="Clarify">?</button>
      </div>
    </div>
    <div id="qtext" style="font-size:1.2rem;margin-top:12px;">${code ? "Ready" : "Missing room code"}</div>
  `;
  top.appendChild(card);

  // Answer area (visible to both roles; your backend enforces turn-taking)
  const answer = el("div", { class:"ms-field" });
  answer.innerHTML = `
    <label>Your message</label>
    <textarea id="answer" class="ms-input" rows="4" placeholder="Type your response..."></textarea>
    <div class="ms-actions">
      <button id="submit" class="ms-btn primary">Send</button>
    </div>
  `;
  top.appendChild(answer);

  // Wire host actions
  if (isHost){
    controls.querySelector("#start").addEventListener("click", async () => {
      try{ 
        const ctx = await ensureContext(code);
        await api.startGame(ctx.gameId || ctx.code);
      }catch(e){ alert(e.message || "Start failed"); }
    });
    controls.querySelector("#reveal").addEventListener("click", async () => {
      try{ const q = await api.revealNextCard(code); document.getElementById("qtext").textContent = q?.text || "…" }catch(e){ alert(e.message || "Reveal failed"); }
    });
    controls.querySelector("#extend").addEventListener("click", async () => {
      try{ await api.extendGame(code); alert("Extended"); }catch(e){ alert(e.message || "Extend failed"); }
    });
    controls.querySelector("#end").addEventListener("click", async () => {
      try{ await api.endAndAnalyze(code); navigate(`/summary/${encodeURIComponent(code)}`); }catch(e){ alert(e.message || "End failed"); }
    });
  }

  // Wire submit for both roles
  top.querySelector("#submit").addEventListener("click", async () => {
    const t = (document.getElementById("answer").value || "").trim();
    if(!t) return;
    try{
      await api.submitAnswer({ sessionId: code || gameId, text: t });
      document.getElementById("answer").value = "";
    }catch(e){ alert(e.message || "Send failed"); }
  });

  return top;
}
