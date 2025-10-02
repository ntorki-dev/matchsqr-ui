export async function render(){
  const card = document.createElement("div");
  card.className = "ms-card";
  card.innerHTML = `
    <h2>Upgrade</h2>
    <p>Simulated upgrade flow.</p>
    <div class="ms-actions">
      <button class="ms-btn primary" onclick="history.back()">OK</button>
    </div>
  `;
  return card;
}
