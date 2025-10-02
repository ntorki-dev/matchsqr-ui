import * as api from "../api-adapter.js";

export async function render(){
  const card = document.createElement("div");
  card.className = "ms-card";
  card.innerHTML = `
    <h2>Reset password</h2>
    <div class="ms-field">
      <label>Email</label>
      <input id="email" class="ms-input" type="email" autocomplete="email" />
    </div>
    <div class="ms-actions">
      <button id="send" class="ms-btn primary">Send reset link</button>
    </div>
  `;
  card.querySelector("#send").addEventListener("click", async () => {
    const email = card.querySelector("#email").value.trim();
    try{
      await api.sendReset(email);
      alert("If this email exists, a reset link was sent");
    }catch(e){
      alert(e.message || "Failed to send");
    }
  });
  return card;
}
