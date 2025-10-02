function need(name){
  const fn = window[name];
  if(typeof fn !== "function"){
    throw new Error(`Expected global function ${name} from your existing app. Map it in api-adapter.js`);
  }
  return fn;
}

export async function isLoggedIn(){
  if(window.auth && typeof window.auth.getSession === "function"){
    const s = await window.auth.getSession();
    return !!s;
  }
  if(window.supabase && window.supabase.auth){
    const { data } = await window.supabase.auth.getSession();
    return !!(data && data.session);
  }
  return false;
}

// Auth
export const login = (...a) => need("authLogin")(...a);
export const register = (...a) => need("authRegister")(...a);
export const sendReset = (...a) => need("authSendReset")(...a);
export const resetPassword = (...a) => need("authResetPassword")(...a);
export const getProfile = (...a) => need("profileGet")(...a);
export const updateProfile = (...a) => need("profileUpdate")(...a);
export const signOut = (...a) => need("authSignOut")(...a);

// Game flow
export const createRoom = (...a) => need("gameCreateRoom")(...a);
export const joinRoom = (...a) => need("gameJoinRoom")(...a);
export const startGame = (...a) => need("gameStart")(...a);
export const revealNextCard = (...a) => need("gameRevealNextCard")(...a);
export const submitAnswer = (...a) => need("gameSubmitAnswer")(...a);
export const extendGame = (...a) => need("gameExtend")(...a);
export const endAndAnalyze = (...a) => need("gameEndAndAnalyze")(...a);

// Reports
export const sendFullReport = (...a) => need("reportsSendFull")(...a);
