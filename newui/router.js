export const Router = (() => {
  const routes = {}; let notFound=null;
  function on(path, handler){ routes[path]=handler; }
  function setNotFound(h){ notFound=h; }
  function parse(){ return location.hash.slice(1) || "/"; }
  async function resolve(){
    const path=parse();
    for (const route in routes){
      const keys=[];
      const pattern=route.replace(/:([^/]+)/g,(_,k)=>{ keys.push(k); return '([^/]+)'; });
      const re=new RegExp("^"+pattern+"$"); const m=path.match(re);
      if (m){ const p={}; keys.forEach((k,i)=>p[k]=decodeURIComponent(m[i+1])); await routes[route](p); return; }
    }
    if (notFound) await notFound({path});
  }
  window.addEventListener('hashchange', resolve);
  window.addEventListener('load', resolve);
  return { on, setNotFound, resolve };
})();