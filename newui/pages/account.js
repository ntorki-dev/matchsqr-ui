import * as api from "../api-adapter.js";

export async function render(){
  const card = document.createElement("div");
  card.className = "ms-card";
  card.innerHTML = `
    <h2>Account</h2>
    <div class="ms-row">
      <div class="ms-col ms-field">
        <label>Name</label>
        <input id="name" class="ms-input" type="text" />
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
      <input id="email" class="ms-input" type="email" disabled />
    </div>
    <div class="ms-actions">
      <button id="save" class="ms-btn primary">Save</button>
      <button id="signout" class="ms-btn">Sign out</button>
    </div>
  `;

  try{
    const p = await api.getProfile();
    if(p){
      card.querySelector("#name").value = p.name || "";
      card.querySelector("#birthdate").value = p.birthdate || "";
      card.querySelector("#gender").value = p.gender || "";
      card.querySelector("#email").value = p.email || "";
    }
  }catch{}

  card.querySelector("#save").addEventListener("click", async () => {
    const payload = {
      name: card.querySelector("#name").value.trim(),
      birthdate: card.querySelector("#birthdate").value || null,
      gender: card.querySelector("#gender").value || null
    };
    try{
      await api.updateProfile(payload);
      alert("Saved");
    }catch(e){
      alert(e.message || "Failed to save");
    }
  });

  card.querySelector("#signout").addEventListener("click", async () => {
    try{
      await api.signOut();
      location.hash = "#/";
      location.reload();
    }catch(e){
      alert(e.message || "Failed to sign out");
    }
  });

  return card;
}
