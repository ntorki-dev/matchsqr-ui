import * as api from "../api-adapter.js";
import { navigate } from "../router.js";

export async function render(){
  const card = document.createElement("div");
  card.className = "ms-card";
  card.innerHTML = `
    <h2>Choose a new password</h2>
    <div class="ms-field">
      <label>New password</label>
      <input id="password" class="ms-input" type="password" autocomplete="new-password" />
    </div>
    <div class="ms-actions">
      <button id="save" class="ms-btn primary">Save</button>
    </div>
  `;
  card.querySelector("#save").addEventListener("click", async () => {
    const password = card.querySelector("#password").value;
    try{
      await api.resetPassword(password);
      navigate("/login");
    }catch(e){
      alert(e.message || "Failed to reset");
    }
  });
  return card;
}
