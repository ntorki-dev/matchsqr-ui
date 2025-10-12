// ui.js (reverted: header/footer rendered inside #app, no structural chrome changes)
import { getSession } from './api.js';

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
  const headerHTML = `
    <div class="header">
      <a class="brand" href="#/"><img src="./assets/logo.png" alt="logo"/><span>MatchSqr</span></a>
      <div class="right" id="hdrRight">
        <a class="btn-login" href="#/login">Login</a>
        <a class="btn-help" href="#/help" aria-label="Help">?</a>
      </div>
    </div>`;
  if (app && !document.querySelector('.header')) app.innerHTML = headerHTML + app.innerHTML;
  try{
    const session = await getSession();
    const user = session?.user || null;
    if (user){
      const name = user.user_metadata?.name || (user.email? user.email.split('@')[0] : 'Account');
      const right = document.getElementById('hdrRight');
      if (right){
        right.innerHTML = `
          <a class="avatar-link" href="#/account" title="${name}"><img class="avatar" src="./assets/profile.png" alt="profile"/></a>
          <a class="btn-help" href="#/help" aria-label="Help">?</a>`;
      }
    }
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
  const li = ppl.map(p=>{
    const pid = p?.participant_id || p?.id || '';
    const name = p?.nickname || p?.name || 'Guest';
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
