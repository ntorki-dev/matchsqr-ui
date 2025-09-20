# MatchSqr Frontend (Static)

Simple static site that talks to your Supabase Edge Functions. Host it on GitHub Pages.

## Files
- `index.html` UI for Home, Host, and Join.
- `styles.css` basic styles.
- `config.js` 
- `app.js` browser logic.


## CORS
Your Edge Functions must return CORS headers like:
```
access-control-allow-origin: *
access-control-allow-headers: authorization, x-client-info, apikey, content-type
access-control-allow-methods: GET, POST, OPTIONS
```
Use the same set you already have in `create_game` for the other functions if needed.

