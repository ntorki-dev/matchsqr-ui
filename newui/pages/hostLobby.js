import { navigate } from "../router.js";

export async function render({ params }){
  const code = params.code || "";
  const c = document.createElement("div");
  c.className = "ms-card";
  c.innerHTML = `
    <h2>Host Lobby</h2>
    <div class="ms-field">
      <label>Game code</label>
      <div class="ms-row" style="align-items:center;gap:12px;">
        <div id="codeTag" class="code-tag" aria-label="Game code">${code}</div>
        <button id="copy" class="ms-btn">Copy</button>
        <button id="goto" class="ms-btn primary">Go to room</button>
      </div>
    </div>
  `;
  c.querySelector("#copy").addEventListener("click", () => {
    navigator.clipboard.writeText(code);
    alert("Copied");
  });
  c.querySelector("#goto").addEventListener("click", () => {
    navigate(`/game/${encodeURIComponent(code)}`);
  });
  return c;
}
