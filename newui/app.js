import { navigate } from "./router.js";
import { updateHeader } from "./shell.js";

// Read CONFIG directly from ../config.js. No config-adapter.js needed.
window.__MS_UI_VERSION = "Revamp-UI-CleanConfig";

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
  await updateHeader();
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if(code && (!location.hash || location.hash === "#/")) navigate("/join");
}
boot();
