import { navigate } from "../router.js";

export async function render({ params }){
  const card = document.createElement("div");
  card.className = "ms-card";
  const code = params.code || "";
  card.innerHTML = `
    <h2>Host Lobby</h2>
    <div class="ms-field">
      <label>Game code</label>
      <div class="ms-row" style="align-items:center">
        <input id="code" class="ms-input" value="${code}" readonly />
        <button id="copy" class="ms-btn">Copy</button>
        <button id="goto" class="ms-btn primary">Go to room</button>
      </div>
    </div>
  `;
  card.querySelector("#copy").addEventListener("click", () => {
    const v = card.querySelector("#code").value;
    navigator.clipboard.writeText(v);
    alert("Copied");
  });
  card.querySelector("#goto").addEventListener("click", () => {
    const v = card.querySelector("#code").value;
    navigate(`/game/${encodeURIComponent(v)}`);
  });
  return card;
}
