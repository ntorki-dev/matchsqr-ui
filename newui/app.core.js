// app.core.js
// Boot, tiny router, route table, and layout switching.
// This file wires page modules together. No business logic here.

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

function register(path, handler){
  routes.set(path, handler);
}

// Hash parser -> { path, query }
// Supports hashes like "#/account" or "#/login?next=%2F#%2Faccount"
function parseHash(){
  const h = location.hash || '#/';
  const [path, queryString] = h.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryString || ''));
  return { path, query };
}

// Route guard for protected pages
async function guard(path, ctx){
  // Account and Billing are protected
  if (path === '#/account' || path === '#/billing') {
    const session = await getSession();
    if (!session || !session.user) {
      try { sessionStorage.setItem('__redirect_after_login', path); } catch {}
      location.hash = '#/login';
      return false;
    }
  }
  // Game: module has its own guards for host actions. We do not block guests here.
  return true;
}

async function navigate(){
  const { path, query } = parseHash();
  const ctx = { path, query };

  const handler = routes.get(path) || Home.render;

  if (!(await guard(path, ctx))) return;

  await handler(ctx);
}

// Route table
register('#/', Home.render);
register('#/host', Host.render);
register('#/join', Join.render);
register('#/game', Game.render); // module guards host-only flows internally
register('#/login', (ctx)=>Account.render({ ...ctx, tab: 'login' }));
register('#/account', (ctx)=>Account.render({ ...ctx, tab: 'account' }));
register('#/billing', Billing.render);
register('#/terms', (ctx)=>StaticPages.render({ page: 'terms' }));
register('#/privacy', (ctx)=>StaticPages.render({ page: 'privacy' }));
register('#/help', (ctx)=>StaticPages.render({ page: 'help' }));

// Initial boot
if (!location.hash) location.hash = '#/';
ensureDebugTray();
setOfflineBanner(!navigator.onLine);
addEventListener('hashchange', navigate);
navigate();
