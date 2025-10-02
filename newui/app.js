import { navigate } from "./router.js";

window.__MS_UI_VERSION = "Revamp-UI-CleanMapped";

function assertConfig(){
  const cfg = (window.CONFIG || {});
  if(!cfg.FUNCTIONS_BASE){
    console.warn("CONFIG.FUNCTIONS_BASE missing. API calls may fail until config.js is present.");
  }
}

async function boot(){
  assertConfig();
  const v = document.getElementById("ui-version");
  if(v) v.textContent = window.__MS_UI_VERSION || "v0";
  // Do NOT call updateHeader here; router.js does it after rendering, to avoid duplicates.
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if(code && (!location.hash || location.hash === "#/")) navigate("/join");
}
boot();
