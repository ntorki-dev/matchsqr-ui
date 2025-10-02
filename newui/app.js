import { navigate } from "./router.js";
import { ensureConfig } from "./config-adapter.js";
import { updateHeader } from "./shell.js";

window.__MS_UI_VERSION = "Revamp-UI-Seed-2";

async function boot(){
  ensureConfig();
  const v = document.getElementById("ui-version");
  if(v) v.textContent = window.__MS_UI_VERSION || "v0";
  await updateHeader();
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if(code && (!location.hash || location.hash === "#/")){
    navigate("/join");
  }
}
boot();
