import { navigate } from "../router.js";
import * as api from "../api-adapter.js";

export async function render(){
  const wrap = document.createElement("div");
  wrap.className = "ms-card";

  const h = document.createElement("h1");
  h.textContent = "Welcome";
  wrap.appendChild(h);

  const actions = document.createElement("div");
  actions.className = "ms-actions";

  const hostBtn = document.createElement("button");
  hostBtn.className = "ms-btn primary";
  hostBtn.textContent = "Host the Game";
  hostBtn.addEventListener("click", async () => {
    const loggedIn = await api.isLoggedIn();
    if(!loggedIn){ navigate("/login"); return; }
    const { code } = await api.createRoom();
    navigate(`/host/lobby/${encodeURIComponent(code)}`);
  });
  actions.appendChild(hostBtn);

  const joinBtn = document.createElement("a");
  joinBtn.className = "ms-btn";
  joinBtn.href = "#/join";
  joinBtn.textContent = "Join the Game";
  actions.appendChild(joinBtn);

  wrap.appendChild(actions);
  return wrap;
}
