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

// Simple route registry
const routes = new Map();

function register(path, handler){ routes.set(path, handler); }

function parseHash(){
  const raw = location.hash || '#/';
  const [p,q] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(q));
  return { path: p, query: params };
}

async function navigate(){
  const { path, query } = parseHash();

  // Special dynamic route for game
  const m = path.match(/^#\/game\/(.+)$/);
  if (m) { await Game.render({ code: m[1] }); return; }

  // Static routes
  if (routes.has(path)) {
    const h = routes.get(path);
    await h({ query });
    return;
  }

  // Default
  await Home.render({});
}

addEventListener('hashchange', navigate);

// Register routes (flat)
register('#/', Home.render);
register('#/host', Host.render);
register('#/join', Join.render);
register('#/game', Game.render); // fallback if no code
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
navigate();