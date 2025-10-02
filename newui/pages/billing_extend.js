export async function render(){
  const card = document.createElement("div");
  card.className = "ms-card";
  card.innerHTML = `
    <h2>Extend session</h2>
    <p>Simulated only, later will be Stripe.</p>
    <div class="ms-actions">
      <button class="ms-btn primary" onclick="history.back()">OK</button>
    </div>
  `;
  return card;
}
