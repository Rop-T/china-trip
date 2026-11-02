# ญาจาง 2026 — trip app

Installable web app for a 4-day Nha Trang trip (13–16 Nov 2026) for 6 friends.

- Live: https://rop-t.github.io/china-trip/
- Day-by-day plan with place photos (Wikimedia Commons) and Google Maps links
- Weather (Open-Meteo), expense split in ₫/฿, live friend locations, shared plan edits
- Sync backend: `cloudflare-worker.js` (Cloudflare Worker + D1, binding `DB`). Set `TRIP_CODE` before deploying and share it only inside the group.

Photo credits: each photo links to its Wikimedia Commons page with author and licence.
