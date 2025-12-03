// static.js
import { renderHeader, ensureDebugTray } from './ui.js';

export async function render(ctx){
  const page = ctx?.page || 'help';
  const app=document.getElementById('app');
  let content = '';
  if (page==='terms'){ content = `<h2>Terms</h2><p class="help">…</p>`; }
  else if (page==='privacy'){ content = `<h2>Privacy</h2><p class="help">…</p>`; }
  else { content = `<h2>Help</h2><p class="help">…</p>`; }
  app.innerHTML=`<div class="container"><div class="card" style="margin:28px auto;max-width:840px;">${content}</div></div>`;
  await renderHeader(); ensureDebugTray();
}