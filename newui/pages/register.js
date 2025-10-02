import { navigate } from "../router.js";
import * as api from "../api-adapter.js";

export async function render(){
  const card = document.createElement("div");
  card.className = "ms-card";
  card.innerHTML = `
    <h2>Create account</h2>
    <div class="ms-row">
      <div class="ms-col ms-field">
        <label>Name</label>
        <input id="name" class="ms-input" type="text" autocomplete="name" />
      </div>
      <div class="ms-col ms-field">
        <label>Birthdate</label>
        <input id="birthdate" class="ms-input" type="date" />
      </div>
      <div class="ms-col ms-field">
        <label>Gender</label>
        <select id="gender" class="ms-select">
          <option value="">Prefer not to say</option>
          <option value="man">Man</option>
          <option value="woman">Woman</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>
    <div class="ms-field">
      <label>Email</label>
      <input id="email" class="ms-input" type="email" autocomplete="email" />
    </div>
    <div class="ms-field">
      <label>Password</label>
      <input id="password" class="ms-input" type="password" autocomplete="new-password" />
    </div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:10px;">
      <input id="consent" type="checkbox" />
      I agree to the <a href="#/terms">&nbsp;Terms</a> and <a href="#/privacy">&nbsp;Privacy</a>
    </label>
    <div class="ms-actions">
      <button id="create" class="ms-btn primary">Create account</button>
      <a class="ms-btn" href="#/login">I already have an account</a>
    </div>
  `;
  card.querySelector("#create").addEventListener("click", async () => {
    const payload = {
      name: card.querySelector("#name").value.trim(),
      birthdate: card.querySelector("#birthdate").value || null,
      gender: card.querySelector("#gender").value || null,
      email: card.querySelector("#email").value.trim(),
      password: card.querySelector("#password").value,
      consent: card.querySelector("#consent").checked
    };
    if(!payload.consent){ alert("Please agree to Terms and Privacy"); return; }
    try{
      await api.register(payload);
      navigate("/login");
    }catch(e){
      alert(e.message || "Registration failed");
    }
  });
  return card;
}
