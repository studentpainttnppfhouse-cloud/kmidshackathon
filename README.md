# Hackathon Studio

Staff portal for **KMIDS Hackathon 2027**. One workspace for six departments, so
the work stops living in personal Drives, LINE chats and three different
spreadsheets — and so it survives into 2028 instead of being rebuilt from
scratch.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind v4 · Prisma ·
TiDB Cloud (MySQL) · Render.
**Running cost:** 0 THB on the free tiers.

---

## Sign in once

The requirement that shaped the auth design: *staff sign in one time, and stay
signed in through portal updates.*

Sessions are **opaque database-backed tokens**, not signed cookies. The browser
holds 32 random bytes; the database holds only their SHA-256 hash. No
application secret is involved in validating a request, which means:

| Event | Are people signed out? |
| --- | --- |
| You push a new version and Render redeploys | **No** |
| Render restarts, sleeps, or wakes the service | **No** |
| `AUTH_SECRET` is rotated or regenerated | **No** |
| You add or change database tables via a migration | **No** |
| The person signs out, or an owner revokes the session | Yes — by design |
| 180 days pass with no use | Yes |

Sessions slide forward on use, so anyone who opens the portal even once a month
never has to type a password again. This is verified by a test that rebuilds the
app from scratch with a brand-new `AUTH_SECRET` and confirms the same browser
cookie still gets in — see [`docs/TESTING.md`](docs/TESTING.md).

---

## Getting it live

You need two things: a TiDB Cloud database and a Render account. Both free.

### 1. Database (TiDB Cloud)

1. Create a free **Serverless** cluster at <https://tidbcloud.com>. Pick the
   region closest to Bangkok — `ap-southeast-1` (Singapore) — so it matches the
   Render region and the portal stays quick.
2. Open the cluster → **SQL Editor** and create the database. Migrations create
   *tables*, never the database itself, so this one statement has to happen
   first or the deploy fails with `P1003: database does not exist`:

   ```sql
   CREATE DATABASE hackathon_studio;
   ```

3. **Connect → Connect With → Prisma**, then **Generate password** if you have
   not already (the string shows the password exactly once — copy it now).
   Change the database name at the end of the URL from `test` to
   `hackathon_studio`. You should end up with something shaped like:

   ```
   mysql://2abcXYZ.root:PASSWORD@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/hackathon_studio?sslaccept=strict
   ```

4. Port is `4000`, not MySQL's usual 3306, and TiDB refuses any connection that
   is not TLS. Keep `?sslaccept=strict` on the end — and if you paste a string
   without it, the portal adds it for you (`src/lib/database-url.ts`), so
   nothing fails at 2am over a missing suffix.
5. Serverless clusters accept connections from anywhere by default. If you
   turned that off under **Settings → Networking**, Render's free plan has no
   fixed outbound IP, so leave public access on.

### 2. Hosting (Render)

**Blueprint (recommended).** In Render: **New → Blueprint**, point it at the
repo. `render.yaml` supplies the build command, the start command, the health
check and the region.

**Or a service created by hand.** Render does *not* read `render.yaml` for a
service you made with **New → Web Service**, so set these yourself under
**Settings**, exactly:

| Field | Value |
| --- | --- |
| Build command | `npm ci && npx prisma generate && npm run db:bootstrap -- --strict && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

The build command is the part that creates the tables. A service missing it is
what produces **`The table 'users' does not exist in the current database`** —
the app boots, `/api/health` is green because an empty database answers
`SELECT 1` perfectly, and the first page that reads a table 500s.

Then set the environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the TiDB string from step 1 |
| `OWNER_EMAIL` | your school address — this is how you get the first account |
| `AUTH_SECRET` | `openssl rand -base64 32` (the blueprint generates it for you) |
| `NODE_VERSION` | `22` |

Deploy. `npm start` runs `db:bootstrap` before Next starts (the `prestart`
script), so migrations are applied on every boot and a service that was set up
without the build command above still repairs itself on the next deploy.

### 3. Let yourself in

The portal is invite-only and has no sign-up page, so the first account comes
from the seed. It runs automatically when the database is empty, and the invite
link is **printed in the Render deploy log** — the free plan has no Shell, so
that log is the way in:

```
  ────────────────────────────────────────────────────────
  Bootstrap owner invite for you@kmids.ac.th

    /invite/3Gze_0cxBBX0I0LmBFwqEzH4vzOqYUjW
  ────────────────────────────────────────────────────────
```

Open that path on your deployed URL, set a password, and you are T4 Owner. The
link is reprinted on every boot until somebody has a password, so a missed log
line is not a lockout. Everyone else you invite from **Admin**.

On a paid instance you can do the same thing from **Shell** on the service:

```bash
npm run db:bootstrap          # migrate + seed, safe to re-run
OWNER_EMAIL=you@kmids.ac.th npm run db:seed   # invite only
```

> Sign-in is limited to `@kmids.ac.th`. If the school addresses are not handed
> out yet, set `ALLOWED_EMAIL_DOMAIN` on the service and both the login gate and
> the seed follow it.

### 4. Add the team

**Admin → Invite staff.** Enter a `@kmids.ac.th` address, pick a tier and a
department, then **copy the invite link and send it on LINE**. The portal
deliberately sends no email — that would mean adding SMTP credentials to the
deployment, which the build plan rules out. Same for password resets: an owner
generates a one-time link from Admin and hands it over.

---

## Running it locally

```bash
npm install
cp .env.example .env          # point DATABASE_URL at any MySQL 8 / TiDB
OWNER_EMAIL=you@kmids.ac.th npm run db:bootstrap
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on :3000 |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Permission audit — every tier against every action |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Create a migration from schema changes |
| `npm run db:deploy` | Apply migrations |
| `npm run db:bootstrap` | Migrate + seed an empty database (what Render runs) |
| `npm run db:studio` | Browse the database |

---

## What is in it

| Module | State |
| --- | --- |
| Invite-only auth, long-lived sessions, admin-issued resets | Done |
| Dashboard — per tier, with the countdown to 20 March 2027 | Done |
| Assignments — board, list, calendar, my tasks, comments, approvals | Done |
| Department workspaces ×6 plus General | Done |
| People directory and org chart | Done |
| Documents — metadata here, bodies in Google Docs | Done |
| Files & assets — link index, plus the Brand Kit | Done |
| Forms hub — external Google Forms, internal forms | Done |
| Announcements with read receipts | Done |
| Event-day mode — run sheet, check-in, incident log, quick reference | Done |
| Admin — accounts, tiers, invites, resets, sessions, audit log, export | Done |
| Social Media Command Center | Phase 3 — schema is in place |
| Archive & handover freeze | Phase 6 — `year` columns and export already work |

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how it is built, and the
  decisions that shaped it
- [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md) — the tier model, action by action
- [`docs/TESTING.md`](docs/TESTING.md) — what is verified and how to re-run it
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — running it, backups, event day
