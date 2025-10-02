import { navigate } from "../router.js";
import * as api from "../api-adapter.js";

export async function render(){
  const wrap = document.createElement("div");
  wrap.className = "ms-card";
  wrap.innerHTML = `<h1>Welcome</h1>
  <p>Start or join a session.</p>
  <div class="ms-actions">
    <button id="host" class="ms-btn primary">Host the Game</button>
    <a class="ms-btn" href="#/join">Join the Game</a>
  </div>`;

  wrap.querySelector("#host").addEventListener("click", async () => {
    try{
      const loggedIn = await api.isLoggedIn();
      if(!loggedIn){ navigate("/login"); return; }
      const { code } = await api.createRoom();
      // New room created, go to the host lobby with the code
      navigate(`/host/lobby/${encodeURIComponent(code)}`);
    }catch(e){
      // If host already has an active session, backend returns 409 with payload:
      // { error: "host_has_active_game", code: "<ROOMCODE>", game_id: "<UUID>" }
      if (e && e.status === 409 && (e.code === "host_has_active_game" || e.details?.error === "host_has_active_game")){
        const activeCode = e?.details?.code;
        if (activeCode){
          // Go directly to the host lobby for that code
          navigate(`/host/lobby/${encodeURIComponent(activeCode)}`);
          return;
        }
      }
      alert(e?.message || "Unable to create room");
    }
  });

  return wrap;
}
