import * as api from "../api-adapter.js";
import { navigate } from "../router.js";

export async function render({ params }){
  const wrap = document.createElement("div");
  wrap.className = "ms-card";
  const code = params.id;

  const top = document.createElement("div");
  top.className = "ms-row";
  const timer = document.createElement("div");
  timer.id = "timer";
  timer.setAttribute("aria-live","polite");
  timer.textContent = "00:00:00";
  top.appendChild(timer);
  wrap.appendChild(top);

  const cardArea = document.createElement("div");
  cardArea.className = "ms-field";
  cardArea.innerHTML = `
    <div id="question" class="ms-card" style="background:#0d0f15; border:1px dashed #1f2026;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div id="levelDot" aria-label="level dot" style="width:10px;height:10px;border-radius:999px;background:#4caf50"></div>
        <button id="clarify" class="ms-btn">?</button>
      </div>
      <div id="qtext" style="font-size:1.2rem; margin-top:12px;">Waiting to start</div>
    </div>
  `;
  wrap.appendChild(cardArea);

  const actions = document.createElement("div");
  actions.className = "ms-actions";
  actions.innerHTML = `
    <button id="start" class="ms-btn primary">Start</button>
    <button id="reveal" class="ms-btn">Reveal next card</button>
    <button id="extend" class="ms-btn">Extend</button>
    <button id="end" class="ms-btn">End and analyze</button>
  `;
  wrap.appendChild(actions);

  const answer = document.createElement("div");
  answer.className = "ms-field";
  answer.innerHTML = `
    <label>Your answer</label>
    <textarea id="answer" class="ms-input" rows="4" placeholder="Type here or use voice"></textarea>
    <div class="ms-actions">
      <button id="submit" class="ms-btn primary">Submit answer</button>
    </div>
  `;
  wrap.appendChild(answer);

  actions.querySelector("#start").addEventListener("click", async () => {
    try{ await api.startGame(code); }catch(e){ alert(e.message || "Start failed"); }
  });
  actions.querySelector("#reveal").addEventListener("click", async () => {
    try{
      const q = await api.revealNextCard(code);
      document.getElementById("qtext").textContent = q && (q.text || q.question || "Next");
    }catch(e){ alert(e.message || "Reveal failed"); }
  });
  actions.querySelector("#extend").addEventListener("click", async () => {
    try{ await api.extendGame(code); alert("Extended"); }catch(e){ alert(e.message || "Extend failed"); }
  });
  actions.querySelector("#end").addEventListener("click", async () => {
    try{ await api.endAndAnalyze(code); navigate(`/summary/${encodeURIComponent(code)}`); }catch(e){ alert(e.message || "End failed"); }
  });

  wrap.querySelector("#submit").addEventListener("click", async () => {
    const t = document.getElementById("answer").value.trim();
    if(!t) return;
    try{ await api.submitAnswer({ sessionId: code, text: t }); document.getElementById("answer").value = ""; }catch(e){ alert(e.message || "Submit failed"); }
  });

  return wrap;
}
