// ui.js (reverted: header/footer rendered inside #app, no structural chrome changes)
import { getSession } from './api.js';

// Anti-flash helpers: tiny cache of last known user
const AUTH_CACHE_KEY = 'ms_lastKnownUser';

// Lazy bind to api.getProfileName without altering bundling
async function __msFetchProfileName(userId){
  try{
    const mod = await import('./api.js');
    if (mod && typeof mod.getProfileName === 'function') {
      return await mod.getProfileName(userId);
    }
  }catch(_){}
  return null;
}

function __msGetCachedUser(){
  try{
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    if(!raw) return null;
    const u = JSON.parse(raw);
    if (u && u.id) return u;
  }catch{}
  return null;
}
function __msSetCachedUser(user){
  try{
    if (user && user.id){
      const payload = {
        id: user.id,
        email: user.email || user.user_metadata?.email || null,
        user_metadata: {
          name: displayNameOverride || user.user_metadata?.full_name || user.user_metadata?.name || null,
          avatar_url: user.user_metadata?.avatar_url || null
        }
      };
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(payload));
    }else{
      localStorage.removeItem(AUTH_CACHE_KEY);
    }
  }catch{}
}

export const $ = (sel, root=document) => root.querySelector(sel);

export function toast(msg, ms=2200){
  const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), ms);
}

export function debug(obj){
  try{
    const pre=$('#debug-pre'); if(!pre) return;
    const s=pre.textContent + '\n' + JSON.stringify(obj,null,2);
    pre.textContent=s.slice(-30000);
  }catch{}
}

export function setOfflineBanner(show){ const b=document.querySelector('.offline-banner'); if(!b) return; b.classList.toggle('show', !!show); }
addEventListener('offline',()=>setOfflineBanner(true));
addEventListener('online',()=>setOfflineBanner(false));


export async function renderHeader(){
  const app=document.getElementById('app');
  const cached = __msGetCachedUser();
  // Build initial right content based on cache to avoid Login flash
  const rightInitial = (()=>{
    if (cached && cached.id){
      const name = (cached?.name) || (cached?.user_metadata?.full_name) || (cached?.user_metadata?.name) || 'Account';
      return `<a class="avatar-link" href="#/account" title="${name}"><img class="avatar" src="${cached.user_metadata?.avatar_url || './assets/profile.png'}" alt="profile"/></a>
              <a class="btn-help" href="#/help" aria-label="Help">?</a>`;
    }
    // neutral placeholder to preserve layout, hidden from view
    return `<a class="btn-login" href="#/login" style="visibility:hidden">Login</a>
            <a class="btn-help" href="#/help" aria-label="Help">?</a>`;
  })();

  const headerHTML = `
    <div class="header">
      <a class="brand" href="#/"><img src="./assets/logo.png" alt="logo"/><span>MatchSqr</span></a>
      <div class="ms-center" id="msHeaderCenter" aria-live="polite"></div>
      <div class="right" id="hdrRight">
        ${rightInitial}
      </div>
    </div>`;
  if (app && !document.querySelector('.header')) app.innerHTML = headerHTML + app.innerHTML;

  // Reconcile with live session
  try{
    const session = await getSession();
    const user = session?.user || null;
    const right = document.getElementById('hdrRight');
    if (right){
      if (user){
        const name = (user?.user_metadata?.full_name) || (user?.user_metadata?.name) || (function(){ try { return (__msGetCachedUser && __msGetCachedUser())?.name || null; } catch(_){ return null; } })() || 'Account';
        right.innerHTML = `
          <a class="avatar-link" href="#/account" title="${name}"><img class="avatar" src="${user.user_metadata?.avatar_url || './assets/profile.png'}" alt="profile"/></a>
          <a class="btn-help" href="#/help" aria-label="Help">?</a>`;
      }else{
        right.innerHTML = `<a class="btn-login" href="#/login">Login</a>
          <a class="btn-help" href="#/help" aria-label="Help">?</a>`;
      }
    }
    __msSetCachedUser(user);
  }catch{}
  ensureFooter();
}


export function ensureDebugTray(){
  const app = document.getElementById('app');
  if (!document.getElementById('debug-tray')){
    app?.insertAdjacentHTML('beforeend', `<div class="debug-tray" id="debug-tray"><pre id="debug-pre"></pre></div>`);
  }
  setOfflineBanner(!navigator.onLine);
}

// small helpers for invites/participants UI
export async function shareRoom(code){
  const shareUrl = location.origin + location.pathname + '#/join';
  const text = 'Join my MatchSqr game. Code: ' + code;
  try{ if (navigator.share){ await navigator.share({ title:'MatchSqr Room', text, url:shareUrl }); return; } }catch(_){}
  try{ await navigator.clipboard.writeText(text + ' ' + shareUrl); toast('Invite copied'); }catch(_){ toast('Copy failed, share manually'); }
}

export function participantsListHTML(ppl, curPid){
  if (!Array.isArray(ppl) || ppl.length===0) return '<ul id="participantsList"><li class="meta">No one yet</li></ul>';
  // Read cached account user once (same cache Account page uses)
  let __cu = null; try { __cu = (__msGetCachedUser && __msGetCachedUser()) || null; } catch(_) { __cu = null; }
  const __cuEmailName = (__cu && typeof __cu.email==='string') ? (__cu.email.split('@')[0]||null) : null;
  const __cuDisplay = (__cu?.user_metadata?.name) || (__cu?.name) || null;

  const li = ppl.map(p=>{
    const pid = p?.participant_id || p?.id || '';
    const uid = p?.user_id || p?.auth_user_id || p?.owner_id || p?.userId || p?.uid || '';
    // Start with normal fallback
    let name = p?.profile_name || p?.nickname || p?.name || 'Guest';
    // If this participant is the current logged-in user, force the DB (Account) name instead of email-derived
    const isMe = !!(__cu && (
      (uid && String(uid)===String(__cu.id||'')) ||
      (__cuEmailName && typeof p?.name==='string' && p.name===__cuEmailName)
    ));
    if (isMe && __cuDisplay){ name = __cuDisplay; }
    const role = p?.role || (p?.is_host ? 'host' : '');
    const bold = (curPid && String(curPid)===String(pid)) ? ' style="font-weight:700;"' : '';
    const pidAttr = pid ? ` data-pid="${pid}"` : '';
    return `<li${pidAttr}${bold}>${name}${role?` <span class="meta">(${role})</span>`:''}</li>`;
  }).join('');
  return `<ul id="participantsList">${li}</ul>`;
}


export function ensureFooter(){
  try{
    const app=document.getElementById('app');
    if (app && !document.querySelector('.site-footer')){
      app.insertAdjacentHTML('beforeend', `<div class="site-footer"></div>`);
    }
  }catch{}
}

/* === Autofill helper, surgical and non-breaking ===
 * Fixes console warning: inputs recognized for autofill but missing autocomplete.
 * We infer sensible tokens from id/name, set them only when missing.
 * Runs on DOMContentLoaded and for dynamically added nodes via MutationObserver.
 */
(function () {
  function ensureAutocompleteAttributes(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const nodes = scope.querySelectorAll('input, textarea, select');
    for (const el of nodes) {
      if (el.hasAttribute('autocomplete')) continue;
      // Avoid touching iframes or third-party widgets
      if (el.closest('iframe')) continue;

      const name = (el.getAttribute('name') || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      const key = name || id;

      let token = null;
      const has = (pat) => pat.test(key);

      if (/\bemail\b/.test(key)) token = 'email';
      else if (/(new|confirm).{0,10}password/.test(key)) token = 'new-password';
      else if (/password/.test(key)) token = 'current-password';
      else if (/^(first|given)[_\- ]?name$/.test(key)) token = 'given-name';
      else if (/^(last|family)[_\- ]?name$/.test(key)) token = 'family-name';
      else if (/^(full[_\- ]?name|name)$/.test(key)) token = 'name';
      else if (/user(name)?/.test(key)) token = 'username';
      else if (/(phone|tel|mobile)/.test(key)) token = 'tel';
      else if (/country/.test(key)) token = 'country';
      else if (/address.*(1|line1)/.test(key)) token = 'address-line1';
      else if (/address.*(2|line2)/.test(key)) token = 'address-line2';
      else if (/(city|locality)/.test(key)) token = 'address-level2';
      else if (/(state|province|region)/.test(key)) token = 'address-level1';
      else if (/(postal|zip)/.test(key)) token = 'postal-code';
      else if (/(company|organization|organisation|org)/.test(key)) token = 'organization';
      else if (/(nickname|handle)/.test(key)) token = 'nickname';
      else if (/game[_\- ]?id/.test(key)) token = 'off';
      else if (/(otp|one[_\- ]?time|verification|code)/.test(key)) token = 'one-time-code';
      else if (/(cc|card)/.test(key)) {
        if (/name/.test(key)) token = 'cc-name';
        else if (/number|no/.test(key)) token = 'cc-number';
        else if (/exp|expiry|expiration/.test(key)) token = 'cc-exp';
        else if (/csc|cvv|cvc/.test(key)) token = 'cc-csc';
      }

      if (token) {
        el.setAttribute('autocomplete', token);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    try { ensureAutocompleteAttributes(document); } catch (_e) {}
  });

  // Observe dynamic DOM changes, apply lazily on added nodes
  try {
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (n && n.querySelectorAll) {
            ensureAutocompleteAttributes(n);
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_e) {}
})();

export function setHeaderCenter(nodeOrHtml){
  const slot = document.getElementById('msHeaderCenter');
  if (!slot) return;
  while (slot.firstChild) slot.removeChild(slot.firstChild);
  if (!nodeOrHtml) return;
  if (typeof nodeOrHtml==='string') slot.insertAdjacentHTML('afterbegin', nodeOrHtml);
  else if (nodeOrHtml instanceof Node) slot.appendChild(nodeOrHtml);
  else if (Array.isArray(nodeOrHtml)) nodeOrHtml.forEach(n=>{
    if (typeof n==='string') slot.insertAdjacentHTML('beforeend', n);
    else if (n instanceof Node) slot.appendChild(n);
  });
}
export function clearHeaderCenter(){
  const slot = document.getElementById('msHeaderCenter');
  if (!slot) return;
  while (slot.firstChild) slot.removeChild(slot.firstChild);
}
