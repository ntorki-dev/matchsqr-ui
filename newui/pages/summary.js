import * as api from "../api-adapter.js";

export async function render({ params }){
  const card = document.createElement("div");
  card.className = "ms-card";
  card.innerHTML = `
    <h2>Summary</h2>
    <p>Light personal panel. Request the full report by email.</p>
    <div class="ms-actions">
      <button id="send" class="ms-btn primary">Email me my full report</button>
    </div>
  `;
  card.querySelector("#send").addEventListener("click", async () => {
    try{
      await api.sendFullReport({ sessionId: params.id });
      alert("If registered or email provided, the full report will be sent");
    }catch(e){
      alert(e.message || "Failed to send");
    }
  });
  return card;
}
