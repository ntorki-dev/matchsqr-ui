import * as api from "./api-adapter.js";

export async function updateHeader(){
  const header = document.getElementById("header-actions");
  header.innerHTML = "";
  let loggedIn = false;
  try{
    loggedIn = await api.isLoggedIn();
  }catch(e){
    console.warn("[header] auth check failed:", e?.message || e);
    loggedIn = false;
  }
  if(!loggedIn){
    const a = document.createElement("a");
    a.className = "ms-btn";
    a.href = "#/login";
    a.textContent = "Login";
    header.appendChild(a);
  }else{
    const a = document.createElement("a");
    a.className = "ms-btn";
    a.href = "#/account";
    a.textContent = "Account";
    header.appendChild(a);
  }
}
