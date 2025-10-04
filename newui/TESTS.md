# New v2.1 Self-Test Plan (Simulated and Real)

## Simulated (MOCK=true)
1. Open /newui/index.html?debug=1
2. Ensure `window.__MOCK__ = true` in index.html
3. Go to #/host → Create Game → routes to #/game/ABCD12
4. Open another tab #/join, enter ABCD12 → Join
5. In #/game/ABCD12 → Start → timer appears (~20:00)
6. Submit answer as active player → Next card rotates turn
7. Click End and analyze → Summary renders in-room
8. Click “Email me my full report” → success toast
9. Confirm debug tray shows invoke/results

## Real backend (MOCK=false)
1. Ensure /newui/config.js has your exact Supabase URL and anon key (copied already).
2. #/host → Create Game → should create and route to #/game/:code
3. #/join → Enter code → Join
4. Start game → Next card → End and analyze → Summary
5. “Email me my full report” triggers your Mailtrap flow
6. Add ?debug=1 to inspect payloads
