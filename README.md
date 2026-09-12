# Hackathon Studio

Staff portal for **KMIDS Hackathon 2027**. One workspace for every team on the
staff chart, so the work stops living in personal Drives, LINE chats and three
different spreadsheets — and so it survives into 2028 instead of being rebuilt from
scratch.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Prisma ·
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
| `TEAMS_DISPATCH_SECRET` | optional — only if you want Teams notifications; see `docs/TEAMS.md` |

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

Two ways in, and which one you want depends on how many people are in front of
you.

**One person: Admin → Add somebody to the portal.** A name and a
`@kmids.ac.th` address is all it takes; the team, role and tier can be set
later from the user list, once the chart settles. The form hands back the
invite link, so **copy it and send it on LINE**.

**A whole room: Admin → Join links & QR codes.** One link and one QR code the
team scans, the way Teams and Classroom do it. Put the code on the projector at
the first staff meeting and the room registers itself: scan, type a name, a
school email and a password, and they are in and signed in. Each link says what
it grants, counts its uses, and switches off in one click — and there is a
printable poster page for the ones that go on a wall.

A join link is a key, so it is a bounded one. Only `@kmids.ac.th` addresses can
use it, it can never grant an admin account whoever made it, it stops at the
number of uses you set, and revoking it kills every printed copy at once. Every
account records which link it came through.

The portal deliberately sends no email — that would mean adding SMTP
credentials to the deployment, which the build plan rules out. Same for
password resets: an owner generates a one-time link from Admin and hands it
over.

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
| `npm test` | Unit suite — permissions, link safety, uploads, QR, join links, exports, forms, crypto |
| `npm run test:e2e` | Browser suite — needs a running server, see `docs/TESTING.md` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run audit` | Fails on a high/critical advisory in a runtime dependency |
| `npm run db:migrate` | Create a migration from schema changes |
| `npm run db:deploy` | Apply migrations |
| `npm run db:bootstrap` | Migrate + seed an empty database (what Render runs) |
| `npm run db:studio` | Browse the database |

---

## What is in it

| Module | State |
| --- | --- |
| Invite-only auth, long-lived sessions, admin-issued resets | Done |
| Join links & QR codes — one code a whole room scans, with a printable poster | Done |
| Dashboard — per tier, with the countdown to 20 March 2027 | Done |
| Assignments — board, list, calendar, my tasks, comments, approvals | Done |
| Department workspaces ×6 plus General | Done |
| People directory and org chart | Done |
| Documents — written in the portal *or* linked from Drive | Done |
| Document export — `.docx`, `.pdf`, Markdown, no dependencies | Done |
| Files & assets — upload into the portal or link out, plus the Brand Kit | Done |
| Attachments on tasks, documents and announcements — files, not links | Done |
| Draft auto-save — what you typed survives a closed tab | Done |
| Brand Kit — editable palette, generated colour ramps, fonts, PDF export | Done |
| Forms — built and answered in the portal, plus external Google Forms | Done |
| Announcements with read receipts | Done |
| Site-wide search across everything you may read | Done |
| Event-day mode — run sheet, check-in, incident log; hideable until needed | Done |
| Admin — accounts, tiers, invites, bulk import, resets, sessions, audit, export | Done |
| Microsoft Teams notifications — deadlines, announcements and urgent pushes, head/admin controlled | Done |
| Dark mode, print stylesheet, loading states, keyboard and screen-reader paths | Done |
| Social Media Command Center | Phase 3 — schema is in place |
| Archive & handover freeze | Phase 6 — `year` columns and export already work |

## Telling people in Teams

The portal can push what changes here into Microsoft Teams: deadlines that are
close, tasks that are late, announcements as they go up, and anything a head
types on the **Teams alerts** page.

Two halves, and they cost very different amounts to switch on.

| | Channel posts | Personal notifications |
| --- | --- | --- |
| Reaches | a Teams channel | one person's Activity feed |
| Needs | a webhook URL copied from the channel | an Azure app registration |
| Set up by | whoever owns the channel | a Microsoft 365 tenant admin |
| Takes | about a minute | a conversation with IT |

Channel posts cover most of it and need nobody's permission but your own, so
start there. Both are optional: with none of it configured the page still loads
and says exactly what is missing.

Who can do what follows the same department line as everything else — a head
speaks for their own team and nobody else's:

| | Member | Head | Admin |
| --- | --- | --- | --- |
| Send to own department | no | yes | yes |
| Send to all staff | no | no | yes |
| Send privately to a named person | no | own department | anyone |
| Turn automatic rules on | no | own department | portal-wide |
| Add or remove a webhook URL | no | no | yes |

A webhook URL is a credential — anyone holding it can post into the channel as
the portal — so it is encrypted at rest, never shown to a browser again, and the
portal will only ever POST to Microsoft's own webhook hosts.

Messages are queued rather than sent while somebody waits: the announcement is
saved whether or not Microsoft is having a morning. A scheduler calls
`/api/teams/dispatch` to drain the queue, which needs `TEAMS_DISPATCH_SECRET`
set. Without it, messages queue and the page says so.

Full setup, including the Azure half and what every error means: **`docs/TEAMS.md`**.

## Writing documents in the portal

A document is either a **Drive link** the portal indexes, or a document
**written here** — you pick per document. A portal document is Markdown, is
searchable by its contents, can be attached to a task as the submission for it,
and exports to:

| Format | Notes |
| --- | --- |
| `.docx` | A real Word file. Headings, bold, italic, lists, quotes, code. |
| `.pdf` | Generated directly — no headless browser, no font binaries. Latin script only (see `docs/SECURITY.md`). |
| `.md` | The source, for editing anywhere else. |

The editor is a textarea with a live preview rather than a rich-text surface,
and that is deliberate: a contenteditable editor stores HTML, which means
storing markup written by a user and rendering it back — the exact shape of a
stored-XSS bug. Markdown stores text.

## Building a form

**Forms → New form** builds one inside the portal: short answer, paragraph,
number, date, email, dropdown, multiple choice, checkboxes, yes/no/maybe, and a
1–5 scale. Answers stay in TiDB. Only the form's owner and admins can read the
response table; everybody else sees their own answers and can change them until
the form closes.

External Google Forms still work exactly as before — the portal tracks the
link, the owner, the deadline and where the responses land.

## Documentation

- [`docs/SECURITY.md`](docs/SECURITY.md) — the threat model, every control, and
  the limits stated plainly
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how it is built, and the
  decisions that shaped it
- [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md) — the tier model, action by action
- [`docs/TESTING.md`](docs/TESTING.md) — what is verified and how to re-run it
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — running it, backups, event day
