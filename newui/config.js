// newui/config.js
// COPY your exact values from legacy config.js into FALLBACK_SUPABASE_URL and FALLBACK_SUPABASE_ANON_KEY.
// If your legacy UI reads them from an endpoint, you can keep doing that, but the simplest path is to paste them here.
window.CONFIG = window.CONFIG || {
  FUNCTIONS_BASE: "https://YOUR-PROJECT.supabase.co/functions/v1",
  FALLBACK_SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  FALLBACK_SUPABASE_ANON_KEY: "PASTE-YOUR-ANON-KEY"
};
(function(){
  try {
    const params = new URLSearchParams(location.search);
    const fb = params.get("functions_base"); if (fb) window.CONFIG.FUNCTIONS_BASE = fb;
    const su = params.get("supabase_url"); if (su) window.CONFIG.FALLBACK_SUPABASE_URL = su;
    const sk = params.get("supabase_anon"); if (sk) window.CONFIG.FALLBACK_SUPABASE_ANON_KEY = sk;
  } catch(e){}
})();
