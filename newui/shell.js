import * as api from "./api-adapter.js";

export async function updateHeader(){
  const header = document.getElementById("header-actions");
  header.innerHTML = "";
  const loggedIn = await api.isLoggedIn();

  if(!loggedIn){
    const btn = document.createElement("a");
    btn.className = "ms-btn";
    btn.href = "#/login";
    btn.textContent = "Login";
    header.appendChild(btn);
  }else{
    const accountLink = document.createElement("a");
    accountLink.href = "#/account";
    accountLink.title = "Account";
    accountLink.setAttribute("aria-label","Account");
    accountLink.className = "ms-btn";
    accountLink.textContent = "Account";
    header.appendChild(accountLink);
  }
}
