import { navigate } from "../router.js";
import * as api from "../api-adapter.js";

export async function render(){
  const card = document.createElement("div");
  card.className = "ms-card";
  card.innerHTML = `
    <h2>Login</h2>
    <div class="ms-field">
      <label>Email</label>
      <input id="email" class="ms-input" type="email" autocomplete="email" />
    </div>
    <div class="ms-field">
      <label>Password</label>
      <input id="password" class="ms-input" type="password" autocomplete="current-password" />
    </div>
    <div class="ms-row" style="align-items:center; justify-content:space-between; margin-top:8px;">
      <a href="#/forgot-password">Forgot password?</a>
    </div>
    <div class="ms-actions">
      <button id="login" class="ms-btn primary">Login</button>
      <a class="ms-btn" href="#/register">Create account</a>
    </div>
  `;
  card.querySelector("#login").addEventListener("click", async () => {
    const email = card.querySelector("#email").value.trim();
    const password = card.querySelector("#password").value;
    try{
      await api.login(email, password);
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if(code) return navigate(`/game/${encodeURIComponent(code)}`);
      navigate("/");
    }catch(e){
      alert(e.message || "Login failed");
    }
  });
  return card;
}
