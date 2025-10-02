export function ensureConfig(){
  const g = window || {};
  const known = g.CONFIG || g.__CONFIG || g.MS_CONFIG || {};
  g.__MS_CFG__ = {
    SUPABASE_URL: known.SUPABASE_URL || g.SUPABASE_URL,
    SUPABASE_ANON_KEY: known.SUPABASE_ANON_KEY || g.SUPABASE_ANON_KEY,
  };
  if(!g.__MS_CFG__.SUPABASE_URL || !g.__MS_CFG__.SUPABASE_ANON_KEY){
    console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY from config.js");
    throw new Error("Config missing");
  }
}
