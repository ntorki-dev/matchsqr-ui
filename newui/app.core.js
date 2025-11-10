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
  // Raw hash, default to home
  const raw0 = location.hash || '#/';

  // Normalize accidental second "?" inside hash (e.g., "#/account?tab=reset?token=...")
  let raw = raw0;
  const q1 = raw.indexOf('?');
  if (q1 !== -1) {
    const after = raw.slice(q1 + 1);
    const fix = after.replace('?', '&');
    raw = raw.slice(0, q1 + 1) + fix;
  }

  // Handle a second "#" used by some providers for tokens:
  // "#/reset#access_token=...&type=recovery&..."
  let tailParams = '';
  const secondHash = raw.indexOf('#', 1); // look for another "#" after the first char
  if (secondHash > 0) {
    tailParams = raw.slice(secondHash + 1);   // "access_token=...&type=recovery..."
    raw = raw.slice(0, secondHash);           // keep only "#/reset[?query]"
  }

  const qIndex = raw.indexOf('?');
  const hashPart = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const hashQuery = qIndex >= 0 ? raw.slice(qIndex + 1) : '';

  // Merge: hash query + page search + tail-after-second-# params
  const merged = new URLSearchParams(hashQuery || '');

  const searchQS = (location.search || '').replace(/^\?/, '');
  if (searchQS) {
    const search = new URLSearchParams(searchQS);
    for (const [k,v] of search.entries()) merged.set(k, v);
  }

  if (tailParams) {
    const tail = new URLSearchParams(tailParams.replace(/^\?/, ''));
    for (const [k,v] of tail.entries()) merged.set(k, v);
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

/* ---------------------- Centralized URL error handling ---------------------- */
// Map known error codes to friendly messages + destinations
const ERROR_HANDLERS = {
  otp_expired:       { msg: 'That link expired. Request a new one.',      dest: '#/account?tab=forgot' },
  otp_invalid:       { msg: 'That link is not valid. Request a new one.', dest: '#/account?tab=forgot' },
  access_denied:     { msg: 'Access denied. Please try again.',           dest: '#/login' },
  provider_disabled: { msg: 'This sign-in method is disabled.',           dest: '#/login' },
  email_link_signin: { msg: 'Please use the latest email link.',          dest: '#/account?tab=forgot' },
};

function handleAuthErrors(ctx) {
  const code = (ctx?.query?.error_code || ctx?.query?.error || '').toLowerCase();
  const raw  = ctx?.query?.error_description || '';
  const desc = raw ? decodeURIComponent(raw) : '';

  if (!code && !desc) return; // nothing to do

  const conf = ERROR_HANDLERS[code] || {
    msg: desc || 'Something went wrong. Please try again.',
    dest: '#/login'
  };

  // Toast the user-friendly message (best effort)
  try { import('./ui.js').then(ui => ui.toast(conf.msg)).catch(()=>{}); } catch {}

  // Clean the URL and route once (no loop)
  const u = new URL(location.href);
  u.search = ''; // remove ?error=...
  u.hash = conf.dest;
  history.replaceState(null, '', u.toString());
}

/* --------------------------------- Guard ---------------------------------- */
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

  // Handle URL auth errors first
  handleAuthErrors(ctx);

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
register('#/reset',   (ctx)=>Account.render({ ...ctx, tab: 'reset' }));   // Dedicated recovery route
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
