export const Router = (() => {
  const routes = {};
  let notFound = null;

  function on(path, handler) { routes[path] = handler; }
  function setNotFound(handler) { notFound = handler; }

  function parse() {
    const hash = location.hash.slice(1) || "/";
    return hash;
  }

  async function resolve() {
    const path = parse();
    for (const route in routes) {
      const keys = [];
      const pattern = route.replace(/:([^/]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
      const regex = new RegExp("^" + pattern + "$");
      const match = path.match(regex);
      if (match) {
        const params = {};
        keys.forEach((k, i) => params[k] = decodeURIComponent(match[i+1]));
        await routes[route](params);
        return;
      }
    }
    if (notFound) await notFound({ path });
  }

  window.addEventListener('hashchange', resolve);
  window.addEventListener('load', resolve);

  return { on, setNotFound, resolve };
})();