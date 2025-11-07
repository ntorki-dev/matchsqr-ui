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

// Normalize Supabase recovery fragments (e.g., "#access_token=...&type=recovery...")
function normalizeRecoveryFragment() {
  const h = location.hash || '';
  if (h && !h.startsWith('#/')) {
    const frag = h.startsWith('#') ? h.slice(1) : h;
    const qs = new URLSearchParams(frag);
    const type = qs.get('type');
    if (type === 'recovery') {
      const extra = frag ? ('&' + frag) : '';
      location.hash = '#/account?tab=reset' + extra;
      return true;
    }
  }
  return false;
}

// Hash parser -> returns { path, query, ctx }
function parseHash(){
  const raw = location.hash || '#/';
  const qIndex = raw.indexOf('?');
  const hashPart = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const queryString = qIndex >= 0 ? raw.slice(qIndex + 1) : '';
  const query = Object.fromEntries(new URLSearchParams(queryString || ''));

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

// Route guard for protected pages
async function guard(path, ctx){
  // Account and Billing require auth
  if (path === '#/account' || path === '#/billing') {
    // Allow unauthenticated access to account recovery tabs
    const tab = ctx?.query?.tab;
    if (path === '#/account' && (tab === 'forgot' || tab === 'reset')) {
      return true;
    }

    const session = await getSession();
    if (!session || !session.user) {
      try { sessionStorage.setItem('__redirect_after_login', path); } catch {}
      location.hash = '#/login';
      return false;
    }
  }
  // Game route stays open; module guards host-only actions internally.
  return true;
}

async function navigate(){
  const { path, ctx } = parseHash();
  const handler = routes.get(path) || Home.render;

  const ok = await guard(path, ctx);
  if (!ok) return;

  await handler(ctx);
}

// Route table
register('#/', Home.render);
register('#/host', Host.render);
register('#/join', Join.render);
register('#/game', Game.render); // module handles host auth internally
register('#/login', (ctx)=>Account.render({ ...ctx, tab: 'login' }));
register('#/register', (ctx)=>Account.render({ ...ctx, tab: 'register' }));
// Pass through ?tab=... for account (e.g., change-password, profile, forgot, reset)
register('#/account', (ctx)=>Account.render({ ...ctx, tab: (ctx?.query?.tab || 'account') }));
register('#/billing', Billing.render);
register('#/terms', (ctx)=>StaticPages.render({ page: 'terms' }));
register('#/privacy', (ctx)=>StaticPages.render({ page: 'privacy' }));
register('#/help', (ctx)=>StaticPages.render({ page: 'help' }));

// Initial boot
if (!location.hash) location.hash = '#/';
ensureDebugTray();
setOfflineBanner(!navigator.onLine);
addEventListener('hashchange', () => { if (!normalizeRecoveryFragment()) navigate(); });
if (!normalizeRecoveryFragment()) navigate();
