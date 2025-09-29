export const api = {
  hasLegacy(){ return !!window.LegacyAPI; },
  getViewer(){ return window.LegacyAPI?.getViewer?.() ?? { id:'guest', name:'You', isHost:true, userId:null }; },
  getGame(id){ return window.LegacyAPI?.getGame?.(id) ?? { id, state:'lobby', level:'simple', endsAt: Date.now()+60*60*1000, players:[], allowExtendAt: Date.now()+50*60*1000 }; },
  onGameChanges(id, cb){
    if (window.LegacyAPI?.onGameChanges) return window.LegacyAPI.onGameChanges(id, cb);
    cb(this.getGame(id)); return ()=>{};
  },
  startGame:id=>window.LegacyAPI?.startGame?.(id) ?? Promise.resolve({ok:true}),
  revealNext:id=>window.LegacyAPI?.revealNext?.(id) ?? Promise.resolve({ok:true}),
  submitAnswer:(id,t)=>window.LegacyAPI?.submitAnswer?.(id,t) ?? Promise.resolve({ok:true}),
  endGame:id=>window.LegacyAPI?.endGame?.(id) ?? Promise.resolve({ok:true}),
  extendSession:id=>window.LegacyAPI?.extendSession?.(id) ?? Promise.resolve({ok:true}),
  setLevel:(id,l)=>window.LegacyAPI?.setLevel?.(id,l) ?? Promise.resolve({ok:true}),
  sendFullReport:id=>window.LegacyAPI?.sendFullReport?.(id) ?? Promise.resolve({ok:true}),
};