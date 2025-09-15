# MatchSqr Frontend (Static)

Simple static site that talks to your Supabase Edge Functions. Host it on GitHub Pages.

## Files
- `index.html` UI for Home, Host, and Join.
- `styles.css` basic styles.
- `config.js` set your `FUNCTIONS_BASE` URL. Example: `https://YOUR-REF.supabase.co/functions/v1`.
- `app.js` browser logic that logs in the host, creates a game, starts a local timer, joins as guest, and calls `end_game_and_analyze`.

## Setup (GitHub Pages)
1. Create a new repository on GitHub.
2. Upload these four files to the root of the repository.
3. In the repo Settings → Pages → set Source = `Deploy from a branch`, Branch = `main` (or default), and Folder = `/` (root).
4. Save. After a minute you will get a Pages URL like `https://<your-username>.github.io/<repo>/`.

## Configure
Open `config.js` and set:
```js
window.CONFIG = {
  FUNCTIONS_BASE: "https://YOUR-PROJECT-ref.supabase.co/functions/v1",
  FALLBACK_SUPABASE_URL: "",
  FALLBACK_SUPABASE_ANON_KEY: ""
};
```
This site will fetch `/config` from your functions base to learn the session length and other settings. If your `config` function does not return public `supabase_url` and `supabase_anon_key`, paste them into the two fallback fields.

## CORS
Your Edge Functions must return CORS headers like:
```
access-control-allow-origin: *
access-control-allow-headers: authorization, x-client-info, apikey, content-type
access-control-allow-methods: GET, POST, OPTIONS
```
Use the same set you already have in `create_game` for the other functions if needed.

## Flow covered
- Host logs in with Supabase email and password.
- Host creates a game (db status stays `lobby` for now).
- Host starts a **local** 60-minute timer. DB stays `running`-agnostic until you add `start_game`.
- Guest joins with name and Game Code.
- Host can call `end_game_and_analyze` when ready.

Later we can add:
- start_game function to set `status = 'running'`, `started_at`, and `ends_at` in DB.
- draw_next_card function and the answer submission loop.
