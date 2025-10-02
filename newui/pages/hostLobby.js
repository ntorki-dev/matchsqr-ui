import { navigate } from "../router.js";
import * as api from "../api-adapter.js";

export async function render({ params }){
  const code = (params.code || "").trim();
  const c = document.createElement("div");
  c.className = "ms-card";
  c.innerHTML = `
    <h2>Host Lobby</h2>
    <div class="ms-field">
      <label>Game code</label>
      <div class="ms-row" style="align-items:center;gap:12px;">
        <div id="codeTag" class="code-tag" aria-label="Game code">${code || "—"}</div>
        <button id="copy" class="ms-btn">Copy</button>
        <button id="goto" class="ms-btn primary">Go to room</button>
        <button id="end" class="ms-btn">End session</button>
      </div>
      <p class="ms-meta" style="opacity:.8;margin-top:6px">Jump into the running session or end it.</p>
    </div>
  `;

  c.querySelector("#copy").addEventListener("click", () => {
    if(!code){ alert("Missing game code"); return; }
    navigator.clipboard.writeText(code);
    alert("Copied");
  });

  c.querySelector("#goto").addEventListener("click", () => {
    if(!code){ alert("Missing game code"); return; }
    navigate(`/game/${encodeURIComponent(code)}`);
  });

  c.querySelector("#end").addEventListener("click", async () => {
    if(!code){ alert("Missing game code"); return; }
    try{
      await api.endAndAnalyze(code);
      alert("Session ended.");
      navigate("/");
    }catch(e){
      alert(e?.message || "Failed to end session");
    }
  });

  return c;
}
