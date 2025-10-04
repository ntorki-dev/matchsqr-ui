
(function(){
  function q(key){ const s=new URLSearchParams(location.hash.split('?')[1]||""); return s.get(key); }
  const enabled = (location.search.includes("selftest=1") || q("selftest")==="1");
  if (!enabled) return;

  window.addEventListener("load", ()=>{
    const start = async () => {
      const run = window.__SelfTest.runAll;
      if (!run) return console.warn("[SelfTest] runner not ready");
      const out = await run();
      const logEl = document.createElement("pre");
      logEl.style.position="fixed"; logEl.style.top="10px"; logEl.style.left="10px"; logEl.style.right="10px"; logEl.style.bottom="10px";
      logEl.style.background="#111"; logEl.style.color="#ddd"; logEl.style.padding="12px"; logEl.style.zIndex="9999"; logEl.style.overflow="auto";
      logEl.textContent = JSON.stringify(out, null, 2);
      document.body.appendChild(logEl);
    };
    setTimeout(start, 400);
  });
})();
