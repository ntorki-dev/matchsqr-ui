// app.core.js
// Boot, tiny router, route table, and layout switching.

import * as Home from './home.js';
import * as Host from './host.js';
import * as Join from './join.js';
import * as Game from './game.js';
import * as Account from './account.js';
import * as Billing from './billing.js';
import * as StaticPages from './static.js';
import { ensureDebugTray, setOfflineBanner } from './ui.js';
import { getSession } from './api.js';

// Simple route registry
const routes = new Map();
function register(path, handler){ routes.set(path, handler); }

// Hash parser -> returns { path, query, ctx }
function parseHash(){
  // Normalize double '?' in the hash (e.g., "#/account?tab=reset?token=...")
  const raw0 = location.hash || '#/';
  let raw = raw0;
  const q1 = raw.indexOf('?');
  if (q1 !== -1) {
    const after = raw.slice(q1 + 1);
    const fix = after.replace('?', '&'); // only if present
    raw = raw.slice(0, q1 + 1) + fix;
  }

  const qIndex = raw.indexOf('?');
  const hashPart = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const queryString = qIndex >= 0 ? raw.slice(qIndex + 1) : '';

  // Merge page ?query into hash query so token/type are visible to the router
  const merged = new URLSearchParams(queryString || '');
  const searchQS = (location.search || '').replace(/^\?/, '');
  if (searchQS) {
    const search = new URLSearchParams(searchQS);
    for (const [k, v] of search.entries()) merged.set(k, v);
  }
  const query = Object.fromEntries(merged.entries());

  let path = hashPart;
  const ctx = { path: hashPart, query };

  // Dynamic game route: #/game/:code
  const gm = hashPart.match(/^#\/game\/([^/?#]+)/);
  if (gm) {
    ctx.code = gm[1];
    path = '#/game';
  }

  return { path, query, ctx };
}

// Router guard: keep it minimal; let Account.js enforce its own tab auth
async function guard(path, ctx){
  if (path === '#/billing') {
    const session = await getSession();
    if (!session || !session.user) {
      try { sessionStorage.setItem('__redirect_after_login', path); } catch {}
      location.hash = '#/login';
      return false;
    }
  }
  return true;
}

async function navigate(){
  const { path, ctx } = parseHash();
  const handler = routes.get(path) || Home.render;
  const ok = await guard(path, ctx);
  if (!ok) return;
  await handler(ctx);
}

// Routes
register('#/', Home.render);
register('#/host', Host.render);
register('#/join', Join.render);
register('#/game', Game.render);
register('#/login', (ctx)=>Account.render({ ...ctx, tab: 'login' }));
register('#/register', (ctx)=>Account.render({ ...ctx, tab: 'register' }));
register('#/account', (ctx)=>Account.render({ ...ctx, tab: (ctx?.query?.tab || 'account') }));
register('#/billing', Billing.render);
register('#/terms', (ctx)=>StaticPages.render({ page: 'terms' }));
register('#/privacy', (ctx)=>StaticPages.render({ page: 'privacy' }));
register('#/help', (ctx)=>StaticPages.render({ page: 'help' }));

// Boot
if (!location.hash) location.hash = '#/';
ensureDebugTray();
setOfflineBanner(!navigator.onLine);
addEventListener('hashchange', navigate);
navigate();
