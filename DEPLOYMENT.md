# Production server and Windows client

## Architecture

`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, Prisma Client, and the Next.js API run **only** on one long-lived Node.js production server. The Windows installer is an Electron browser shell; it contains no database credential and no Prisma code.

The appointment event stream is process-local Server-Sent Events (SSE). Run exactly one Node.js server process for this release. If the server is later scaled to multiple replicas, replace `src/lib/appointment-events.ts` with a shared Redis, Ably, Pusher, or Postgres-LISTEN/NOTIFY pub/sub implementation before enabling replicas.

## Deploy the server

1. On the production server, set the values from `.env.production.example` in the host's protected environment. Do not copy this file to a Windows client.
2. Install production dependencies, generate Prisma Client, and create the self-contained Node artifact:

   ```powershell
   npm ci
   npm run server:bundle
   ```

3. Deploy the contents of `.next/standalone` to the server. It includes Next's traced dependencies and Prisma Client/native engine. Run it with `NODE_ENV=production`, `HOSTNAME=127.0.0.1`, and a private `PORT`, for example:

   ```powershell
   $env:NODE_ENV="production"
   $env:HOSTNAME="127.0.0.1"
   $env:PORT="3000"
   node server.js
   ```

4. Put Nginx, IIS, or another TLS reverse proxy in front of that private port. Expose only a stable HTTPS address such as `https://appointments.kidokids.mn`. The proxy must not buffer `/api/events/appointments`; preserve `Connection: keep-alive` and the `X-Accel-Buffering: no` response header.
5. Confirm `https://YOUR-HOST/api/health` responds with `{"status":"ok"}` from a different network. This confirms the reachable API and database connection.

## Build the Windows installer

1. Set the actual HTTPS address in `desktop/app-config.json`:

   ```json
   { "serverUrl": "https://appointments.kidokids.mn" }
   ```

2. On a Windows build machine:

   ```powershell
   npm ci
   npm run desktop:build
   ```

3. Distribute the generated NSIS installer from `release-desktop/`. Each installed client opens the same HTTPS server, so session cookies, API calls, and the realtime SSE stream all use the central server.

Do not add database credentials or a Prisma Client to the desktop installer: doing so would allow every installed computer to connect directly to the production database.
