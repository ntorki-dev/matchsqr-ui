export const routes = {
  "/": { name: "home", loader: () => import("./pages/home.js") },
  "/login": { name: "login", loader: () => import("./pages/login.js") },
  "/register": { name: "register", loader: () => import("./pages/register.js") },
  "/forgot-password": { name: "forgot", loader: () => import("./pages/forgot.js") },
  "/reset-password": { name: "reset", loader: () => import("./pages/reset.js") },
  "/account": { name: "account", loader: () => import("./pages/account.js") },
  "/host/lobby/:code?": { name: "hostLobby", loader: () => import("./pages/hostLobby.js") },
  "/join": { name: "join", loader: () => import("./pages/join.js") },
  "/game/:id": { name: "game", loader: () => import("./pages/game.js") },
  "/summary/:id": { name: "summary", loader: () => import("./pages/summary.js") },
  "/billing/extend": { name: "billExtend", loader: () => import("./pages/billing_extend.js") },
  "/billing/pass": { name: "billPass", loader: () => import("./pages/billing_pass.js") },
  "/billing/upgrade": { name: "billUpgrade", loader: () => import("./pages/billing_upgrade.js") },
  "/help": { name: "help", loader: () => import("./pages/static_help.js") },
  "/learn": { name: "learn", loader: () => import("./pages/static_learn.js") },
  "/terms": { name: "terms", loader: () => import("./pages/static_terms.js") },
  "/privacy": { name: "privacy", loader: () => import("./pages/static_privacy.js") }
};

const paramify = (pattern) => {
  const parts = pattern.split("/").filter(Boolean);
  const regexParts = parts.map(p => p.startsWith(":") ? "([^/]+)" : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp("^/" + regexParts.join("/") + "$");
};

const routeMatchers = Object.keys(routes).map(k => ({ key:k, re:paramify(k) }));

export function parseHash(){
  const hash = location.hash.replace(/^#/, "") || "/";
  for(const r of routeMatchers){
    const m = hash.match(r.re);
    if(m){
      const pathParts = r.key.split("/").filter(Boolean);
      const out = { path: r.key, params: {} };
      let pi = 1;
      for(const p of pathParts){
        if(p.startsWith(":")) out.params[p.slice(1)] = decodeURIComponent(m[pi++] || "");
      }
      return { route: routes[r.key], params: out.params };
    }
  }
  return { route: routes["/"], params: {} };
}

export async function navigate(hash){
  if(location.hash !== "#" + hash) location.hash = hash;
  await render();
}

async function render(){
  const { route, params } = parseHash();
  const mod = await route.loader();
  const el = document.getElementById("app");
  el.innerHTML = "";
  const node = await mod.render({ params, navigate });
  if(node) el.appendChild(node);
  const { updateHeader } = await import("./shell.js");
  await updateHeader();
}

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);
