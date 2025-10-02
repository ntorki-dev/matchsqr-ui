import * as api from "./api-adapter.js";

export async function updateHeader(){
  const header = document.getElementById("header-actions");
  // Strong dedupe: replace the entire node
  const fresh = document.createElement("nav");
  fresh.className = "ms-header__right";
  let loggedIn = false;
  try{ loggedIn = await api.isLoggedIn(); }catch{ loggedIn = false; }

  if(!loggedIn){
    const a = document.createElement("a");
    a.className = "ms-btn";
    a.href = "#/login";
    a.textContent = "Login";
    fresh.appendChild(a);
  }else{
    const a = document.createElement("a");
    a.className = "ms-btn";
    a.href = "#/account";
    a.textContent = "Account";
    fresh.appendChild(a);
  }

  header.replaceWith(fresh);
  fresh.id = "header-actions";
}
