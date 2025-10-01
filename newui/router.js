(function(){
  // Minimal hash router with robust parsing for dynamic paths
  const routes = {};

  function add(path, render){ routes[path] = render; }

  function parse(){
    const raw = location.hash || "#/";
    const [pathOnly, query] = raw.split("?");
    const params = new URLSearchParams(query || "");
    // Normalize: remove leading "#" so dynamic segments parse correctly
    const canonical = pathOnly.replace(/^#/, "");   // "#/game/ABC" -> "/game/ABC"
    return { rawPath: pathOnly, canonicalPath: canonical, params };
  }

  async function render(){
    const { rawPath, canonicalPath, params } = parse();
    const app = document.getElementById("app");
    if (!app) return;

    // Exact static match first (keys are stored with the leading "#/")
    if (routes[rawPath]) return routes[rawPath](app, params);

    // Dynamic paths parsing on canonical (no leading "#")
    const parts = canonicalPath.split("/").filter(Boolean); // e.g. ["game","ABC"]
    if (parts[0] === "host" && parts[1] === "lobby" && parts[2]){
      return window.msScreens?.renderHostLobby(app, parts[2]);
    }
    if (parts[0] === "game" && parts[1]){
      return window.msScreens?.renderGame(app, parts[1]);
    }

    // Fallback to home
    if (routes["#/"]) return routes["#/"](app, params);
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("load", render);

  window.msRouter = { add, render };
})();
