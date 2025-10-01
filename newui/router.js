
(function(){
  const routes = {};
  function add(path, render){ routes[path] = render; }
  function parse(){
    const hash = location.hash || "#/";
    const [path, query] = hash.split("?");
    const params = new URLSearchParams(query||"");
    return { path, params };
  }
  async function render(){
    const { path, params } = parse();
    const app = document.getElementById("app");
    if (!app) return;
    if (routes[path]) return routes[path](app, params);
    const parts = path.split("/").filter(Boolean);
    if (parts[0] === "host" && parts[1] === "lobby" && parts[2]) return window.msScreens.renderHostLobby(app, parts[2]);
    if (parts[0] === "game" && parts[1]) return window.msScreens.renderGame(app, parts[1]);
    return routes["#/"](app, params);
  }
  window.addEventListener("hashchange", render);
  window.addEventListener("load", render);
  window.msRouter = { add, render };
})();
