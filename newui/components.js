export function h(tag, attrs={}, ...children){
  const el=document.createElement(tag);
  for (const [k,v] of Object.entries(attrs||{})){
    if (k==='class') el.className=v;
    else if (k==='style') Object.assign(el.style,v);
    else if (k.startsWith('on') && typeof v==='function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v===true) el.setAttribute(k,'');
    else if (v!==false && v!=null) el.setAttribute(k,v);
  }
  for (const c of children.flat()){
    if (c==null) continue; if (typeof c==='string') el.appendChild(document.createTextNode(c)); else el.appendChild(c);
  }
  return el;
}
export function TopbarHome(){
  return h('div',{class:'topbar'},
    h('div',{class:'left'},
      h('a',{class:'logo',href:'#/'}, h('img',{src:'./assets/logo.svg',alt:'MatchSqr'}), h('span',{},'MatchSqr'))
    ),
    h('div',{class:'center'},''),
    h('div',{class:'right'}, h('a',{class:'btn ghost',href:'#/help',target:'_blank'},'❓'), h('a',{class:'btn',href:'#/login'},'Login'))
  );
}
export function TopbarGame({timerText,canExtend,onExtend,onEnd}){
  return h('div',{class:'topbar'},
    h('div',{class:'left'}, h('a',{class:'logo',href:'#/'}, h('img',{src:'./assets/logo.svg',alt:'MatchSqr'}), h('span',{},'MatchSqr'))),
    h('div',{class:'center'}, h('div',{class:'timer'}, timerText||'0:59m')),
    h('div',{class:'right'}, h('button',{class:'btn secondary',disabled:!canExtend,onClick:onExtend},'Extend'), h('button',{class:'btn',onClick:onEnd},'End game & analyze'), h('div',{title:'Profile'},'👤'))
  );
}
export function Footer(){ return h('div',{class:'footer'}, 'Learn more ', h('a',{class:'link',href:'#/learn-more',target:'_blank'},'about MatchSqr')); }
export function Toast(msg){ const el=h('div',{class:'toast'},msg); document.body.appendChild(el); setTimeout(()=>el.remove(),2200); }