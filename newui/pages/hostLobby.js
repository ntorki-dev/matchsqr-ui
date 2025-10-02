import { navigate } from "../router.js";
import * as api from "../api-adapter.js";

function resolveCode(params){
  // 1) Route params
  let code = (params && params.code ? String(params.code) : "").trim();

  // 2) URL hash fallback: #/host/lobby/<code>
  if(!code){
    const m = (location.hash || "").match(/#\/host\/lobby\/([^/?#]+)/i);
    if(m && m[1]) code = decodeURIComponent(m[1]).trim();
  }

  // 3) Local storage fallback (we save this on create or when backend 409 returns active code)
  if(!code){
    try{
      const last = localStorage.getItem("ms_last_host_code");
      if(last) code = String(last).trim();
    }catch{}
  }

  return code;
}

export async function render({ params }){
  const code = resolveCode(params);
  const c = document.createElement("div");
  c.className = "ms-card";

  // Header + code pill
  const hasCode = !!code;
  c.innerHTML = `
    <h2>Host Lobby</h2>
    <div class="ms-field">
      <label>Game code</label>
      <div class="ms-row" style="align-items:center;gap:12px;">
        <div id="codeTag" class="code-tag" aria-label="Game code">${hasCode ? code : "—"}</div>
        <button id="copy" class="ms-btn" ${hasCode ? "" : "disabled"}>Copy</button>
        <button id="goto" class="ms-btn primary" ${hasCode ? "" : "disabled"}>Go to room</button>
        <button id="end" class="ms-btn" ${hasCode ? "" : "disabled"}>End session</button>
      </div>
      <p class="ms-meta" style="opacity:.8;margin-top:6px">
        ${hasCode ? "Jump into the running session or end it." : "No active code found. Create a new session or go back home."}
      </p>
    </div>

    ${hasCode ? "" : `
      <div class="ms-actions">
        <button id="backHome" class="ms-btn">Back to Home</button>
      </div>
    `}
  `;

  // Wire actions
  if(hasCode){
    c.querySelector("#copy").addEventListener("click", () => {
      navigator.clipboard.writeText(code);
      alert("Copied");
    });
    c.querySelector("#goto").addEventListener("click", () => {
      navigate(`/game/${encodeURIComponent(code)}`);
    });
    c.querySelector("#end").addEventListener("click", async () => {
      try{
        await api.endAndAnalyze(code); // adapter resolves gameId when only code is available
        alert("Session ended.");
        navigate("/");
      }catch(e){
        alert(e?.message || "Failed to end session");
      }
    });
  }else{
    const back = c.querySelector("#backHome");
    if(back) back.addEventListener("click", () => navigate("/"));
  }

  return c;
}
