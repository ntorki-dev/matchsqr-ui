export const api = {
  getViewer(){
    if (window.LegacyAPI && window.LegacyAPI.getViewer) return window.LegacyAPI.getViewer();
    const stored = JSON.parse(localStorage.getItem('ms_viewer') || '{}');
    if (stored.id) return stored;
    const gen = { id: 'guest-' + Math.random().toString(36).slice(2), name: localStorage.getItem('ms_guest_name') || 'Guest', isHost:false, userId: null };
    localStorage.setItem('ms_viewer', JSON.stringify(gen));
    return gen;
  },

  getGame(sessionId){
    if (window.LegacyAPI?.getGame) return window.LegacyAPI.getGame(sessionId);
    return {
      id: sessionId,
      state: 'lobby',
      level: 'simple',
      auto: true,
      endsAt: Date.now() + 60*60*1000,
      players: [
        { id:'p1', name:'Nader', initials:'NA', isHost:true },
        { id:'p2', name:'Ekaterina', initials:'EK', isHost:false },
        { id:'p3', name:'Sofia', initials:'SO', isHost:false },
        { id:'p4', name:'Jerar', initials:'JE', isHost:false },
      ],
      currentTurn: 'p1',
      allowExtendAt: Date.now() + 50*60*1000,
    };
  },

  onGameChanges(sessionId, cb){
    if (window.LegacyAPI?.onGameChanges) return window.LegacyAPI.onGameChanges(sessionId, cb);
    cb(this.getGame(sessionId));
    return () => {};
  },

  async startGame(sessionId){ return window.LegacyAPI?.startGame?.(sessionId) ?? { ok:true }; },
  async revealNext(sessionId){ return window.LegacyAPI?.revealNext?.(sessionId) ?? { ok:true }; },
  async submitAnswer(sessionId, text){ return window.LegacyAPI?.submitAnswer?.(sessionId, text) ?? { ok:true }; },
  async endGame(sessionId){ return window.LegacyAPI?.endGame?.(sessionId) ?? { ok:true }; },
  async extendSession(sessionId){ return window.LegacyAPI?.extendSession?.(sessionId) ?? { ok:true }; },
  async setLevel(sessionId, level){ return window.LegacyAPI?.setLevel?.(sessionId, level) ?? { ok:true }; },
  async sendFullReport(sessionId){ return window.LegacyAPI?.sendFullReport?.(sessionId) ?? { ok:true }; }
};