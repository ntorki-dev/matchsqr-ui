import { navigate } from "../router.js";
import * as api from "../api-adapter.js";

export async function render(){
  const card = document.createElement("div");
  card.className = "ms-card";
  const url = new URL(window.location.href);
  const prefillCode = url.searchParams.get("code") || "";

  card.innerHTML = `
    <h2>Join a game</h2>
    <div class="ms-row">
      <div class="ms-col ms-field">
        <label>Your name</label>
        <input id="name" class="ms-input" type="text" />
      </div>
      <div class="ms-col ms-field">
        <label>Game code</label>
        <input id="code" class="ms-input" type="text" value="${prefillCode}"/>
      </div>
    </div>
    <div class="ms-actions">
      <button id="join" class="ms-btn primary">Join</button>
    </div>
  `;

  try{
    const p = await api.getProfile();
    if(p && p.name) card.querySelector("#name").value = p.name;
  }catch{}

  card.querySelector("#join").addEventListener("click", async () => {
    const name = card.querySelector("#name").value.trim();
    const code = card.querySelector("#code").value.trim();
    if(!name || !code){ alert("Enter name and code"); return; }
    try{
      await api.joinRoom({ code, name });
      navigate(`/game/${encodeURIComponent(code)}`);
    }catch(e){
      alert(e.message || "Join failed");
    }
  });

  return card;
}
