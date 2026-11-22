# Deploying ChatEasy

The app ships as **one Node process** by default: Express serves the REST API, Socket.IO handles
realtime, and the compiled React app is served from the same origin (so no CORS or second host is
needed). The only external service is MongoDB — the data layer is Mongoose, so Firestore, DynamoDB or
SQL would mean rewriting every model and query, not a configuration change. A separate front end/API
hosting is supported too; see “Split deployment” below.

```
Browser ──HTTPS/WSS──> Node container (Express + Socket.IO + build/) ──> MongoDB Atlas
```

That shape rules out static/edge hosts that cannot run a persistent Node server or hold WebSocket
connections. Use a container host — Render, Railway, Fly.io and similar all work with the included
`Dockerfile`.

## 1. Create the database (MongoDB Atlas, free)

1. Sign in at <https://cloud.mongodb.com> and create a **free M0** cluster.
2. **Database Access** → add a user with a strong password.
3. **Network Access** → allow `0.0.0.0/0` (the host has no fixed egress IP on free tiers) or add the
   host's IP range later.
4. **Connect → Drivers** → copy the `mongodb+srv://…` string and append the database name:
   `…/chateasy?retryWrites=true&w=majority`.

## 2. Deploy the API + web app

### Render (blueprint included)

1. Push this repository to GitHub.
2. Render dashboard → **New + → Blueprint** → pick the repo. `render.yaml` defines the service,
   the Docker build and the health check at `/api/health`.
3. Fill the secrets it asks for:

| Variable | Value |
| --- | --- |
| `MONGO_URI` | the Atlas connection string from step 1 |
| `JWT_SECRET` | generated automatically by the blueprint — keep it stable between deploys |
| `APP_ORIGIN` | your public URL, e.g. `https://chateasy.onrender.com` |
| `SMTP_*` | optional, see “Email” below |
| `EXPOSE_DEV_TOKENS` | only for throwaway demos, see the warning below |

4. Wait for the first build, then open `APP_ORIGIN` — you should land on `/login`.

### Railway / Fly.io

Both read the same `Dockerfile`:

```bash
# Railway
railway init && railway up      # then add the env vars in the dashboard

# Fly.io
fly launch --dockerfile Dockerfile --no-deploy
fly secrets set MONGO_URI="…" JWT_SECRET="…" APP_ORIGIN="https://your-app.fly.dev"
fly deploy
```

## 3. Verify the deployment

```bash
curl -s https://YOUR-HOST/api/health      # {"status":"ok","db":"connected",…}
```

Then in the browser: register an account, verify it, sign in, open a second browser profile, and
check that a message arrives without refreshing (that proves the WebSocket upgrade works on the host).

## Push notifications while the app is closed (optional)

Without keys nothing breaks: the bell menu still shows in-app notifications, and the service worker
skips push entirely. To deliver messages to a closed app, generate a VAPID pair and set it on the
host:

```bash
npx web-push generate-vapid-keys     # prints a public and a private key
```

| Variable | Value |
| --- | --- |
| `VAPID_PUBLIC_KEY` | the generated public key |
| `VAPID_PRIVATE_KEY` | the generated private key — treat it as a secret |
| `VAPID_SUBJECT` | a contact URI, e.g. `mailto:you@example.com` |

Push requires HTTPS (the deployed origin qualifies; `localhost` is also treated as secure). Each
browser that enables notifications registers one subscription, and expired endpoints are removed
automatically when the push service reports them gone.

## Split deployment: web app and API on separate hosts (Render)

Use this when the front end and the API should live on different URLs. `render.split.yaml` defines
two services:

| Service | Type | What it runs |
| --- | --- | --- |
| `chateasy-api` | Docker web service (`Dockerfile.api`) | Express + Socket.IO, no React build |
| `chateasy-web` | Static site | `npm run build` output in `./build` |

1. Render dashboard → **New + → Blueprint** → pick the repo → set the blueprint path to
   `render.split.yaml`.
2. Deploy the API first and copy its URL (e.g. `https://chateasy-api.onrender.com`).
3. Deploy the web service with these build-time variables:

| Variable | Value |
| --- | --- |
| `REACT_APP_API_BASE` | `https://chateasy-api.onrender.com/api` |
| `REACT_APP_WS_BASE` | optional, only when the WebSocket host differs from the API host |

4. Back on the API service, set `APP_ORIGIN` to the API URL and `CORS_ORIGINS` to the web URL
   (comma-separated for several). Without `CORS_ORIGINS` the API answers `Access-Control-Allow-Origin: *`.
5. Open the web URL and sign in. If the chat list stays empty while the API health check is green,
   check the browser console for a CORS error and confirm `CORS_ORIGINS` matches the exact origin
   (scheme + host, no trailing slash).

Notes specific to the split setup:

- `REACT_APP_*` variables are compiled into the bundle, so changing them requires a rebuild, not a
  restart.
- Uploads are written to the API container's local disk; a static site has no filesystem. Attach a
  disk to the API service or move uploads to object storage before relying on them.
- Keep the API at one instance: presence, rate limiting and Socket.IO rooms live in memory.
- The service worker and push subscriptions belong to the web origin, which is also the origin that
  must be HTTPS for Web Push to work.

## Production checklist

- **`JWT_SECRET` must be set and stable.** Rotating it signs everybody out.
- **Configure SMTP.** Without it nobody can verify an email, so registration cannot complete.
  For a quick demo only, set `EXPOSE_DEV_TOKENS=true`; that makes the API return verification and
  password-reset tokens in the response, which means anyone can take over any account. Never leave it
  on for a real deployment.
- **`APP_ORIGIN`** must match the public URL so verification/reset/invite links point at the right host.
- **Uploads are local disk.** On free tiers the filesystem is wiped on redeploy, so images and voice
  notes disappear. Attach a persistent disk (paid on most hosts) or move `server/routes/uploads.js`
  to object storage.
- **Run a single instance.** Presence and rate limiting live in memory; two instances would not share
  them. Scale out only after moving both to a shared store.
- **Calls need TURN.** STUN-only peer connections fail behind symmetric NAT; add coturn or a hosted
  TURN relay and pass it to `src/features/.../useCall.ts` (it builds the `RTCPeerConnection` config).
- **Free tiers sleep.** Render spins the service down after inactivity; the first request afterwards
  takes a few seconds and in-flight WebSockets drop (the client reconnects automatically).

## Local production check

```bash
npm ci && npm run build
cd server && npm ci --omit=dev
MONGO_URI="mongodb://127.0.0.1:27017/chateasy" JWT_SECRET="dev-secret" NODE_ENV=production \
  EXPOSE_DEV_TOKENS=true node index.js
# open http://localhost:5000 — the API serves the built SPA
```

To try the Docker image itself:

```bash
docker build -t chateasy .
docker run -p 5000:5000 -e MONGO_URI="…" -e JWT_SECRET="…" chateasy
```
