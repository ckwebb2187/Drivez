# Drivez

Track your drives with GPS, see your speed and routes, drive with friends, and post drives to Discord.
Runs on Cloudflare (Workers + D1 database). Moved off Base44 in October 2026.

## How it fits together
- `src/` – the phone app (React + Vite + Tailwind, Leaflet maps with OpenStreetMap tiles).
- `worker/` – the server: accounts and sign-in, trips/vehicles/routes, friends, live locations,
  leaderboard and Discord posting. Data lives in a Cloudflare D1 database (tables are created automatically).

## Deploy
```
npm install
npx wrangler d1 create drivez      # once; put the id in wrangler.toml
npm run deploy
```

## Optional sign-in services and email
Each is switched on by adding secrets to the worker (`npx wrangler secret put NAME`):

| Feature | Secrets | Redirect URL to register |
|---|---|---|
| Google sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `https://<your-domain>/api/auth/oauth/google/callback` |
| Discord sign-in | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | `https://<your-domain>/api/auth/oauth/discord/callback` |
| Facebook sign-in | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | `https://<your-domain>/api/auth/oauth/facebook/callback` |
| Password reset emails | `RESEND_API_KEY`, `RESEND_FROM` | – |

Buttons for a service only appear once its secrets are set.

## Discord drive posts
Each user pastes a channel webhook link in Profile → Discord. Drives can then be shared from the trip page,
or posted automatically after every drive.

## Limits
Drivez is a web app: it tracks while it's open on screen (it keeps the screen awake during a drive).
It can't detect drives in the background like a native app.
