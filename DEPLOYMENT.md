# Production server and Windows client

## Vercel production

The Vercel deployment uses `vercel.json` to run Functions in Singapore (`sin1`),
alongside the existing Neon database in `ap-southeast-1`. Deploy from this source
with `vercel deploy --prod`; changing the region requires a new deployment.
Keep `DATABASE_URL` and `JWT_SECRET` in the project's production environment.
`.vercelignore` excludes local environment files and Windows release artifacts.

`npm run build` regenerates Prisma Client with the `relationJoins` feature.
Before deploying this version, apply the pending migrations with
`npx prisma migrate deploy` using the server's direct database connection.
It adds staff types, optional staff phone numbers and a session version for
revoking old logins. Existing users retain their current roles and logins.
Test the migration on an isolated database branch before production deployment.
Run `npm test`, `npm run lint`, and `npm run build` before deployment.

The staff registry at `/doctors` now manages all users. Custom staff types use
one of the Admin, Manager, Doctor or Nurse permission profiles. Type profiles
are fixed after creation; reassign a user to change their access. An admin cannot
edit, disable or delete their own account. Users with clinical or audit history
must have access disabled instead of being deleted. Role, username, password and
access changes revoke old sessions; users must sign in again.

Nurse is a separate login-only role. Nurses land on `/nurse` and cannot access
appointments, patients, payments, staff administration or the appointment event
stream. The nurse migrations commit the enum addition separately, then convert
the existing `Сувилагч` type and its assigned users to `NURSE`, revoking their old
sessions. Clinical history is preserved. No new nurse account is seeded.

For the staff API integration check, start a local server against an isolated
branch with the migration applied and a test `JWT_SECRET`. Set
`STAFF_TEST_DATABASE_URL` to that same branch, `STAFF_TEST_DATABASE_HOST` to its
hostname, and optionally `STAFF_TEST_BASE_URL` (default `http://localhost:3100`).
Run `npx tsx tests/staff-api.integration.mts`. The check creates temporary staff,
exercises authorization and session revocation, and removes its fixtures.

The process-local SSE implementation below still requires a shared pub/sub
service for reliable delivery between separate Vercel instances. This is separate
from the function-region and query-latency configuration.

## Architecture

`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, Prisma Client, and the Next.js API run **only** on one long-lived Node.js production server. The Windows installer is an Electron browser shell; it contains no database credential and no Prisma code.

The appointment event stream is process-local Server-Sent Events (SSE). Run exactly one Node.js server process for this release. If the server is later scaled to multiple replicas, replace `src/lib/appointment-events.ts` with a shared Redis, Ably, Pusher, or Postgres-LISTEN/NOTIFY pub/sub implementation before enabling replicas.

## Deploy the server

1. On the production server, set the values from `.env.production.example` in the host's protected environment. `.env.production.example` is only a template and is **not** loaded by the running server. `JWT_SECRET` must be a long random value, must stay unchanged across restarts, and must be identical on every server instance. Do not copy this file to a Windows client.
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
5. Confirm `https://YOUR-HOST/api/health` responds with `{"status":"ok"}` from a different network. This confirms the reachable API, database connection, and required auth configuration. A missing `JWT_SECRET` now makes this endpoint return 503 instead of allowing a broken login deployment to pass its health check.

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
