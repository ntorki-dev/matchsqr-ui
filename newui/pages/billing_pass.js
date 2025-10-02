export async function render(){
  const card = document.createElement("div");
  card.className = "ms-card";
  card.innerHTML = `
    <h2>Buy pass</h2>
    <p>Simulated purchase flow.</p>
    <div class="ms-actions">
      <button class="ms-btn primary" onclick="history.back()">OK</button>
    </div>
  `;
  return card;
}
