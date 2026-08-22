# Operations

## Day-to-day

**Adding someone.** Admin → Invite staff → copy the link → send it on LINE. They
set their own password; nobody ever types a password for somebody else.

**Somebody forgot their password.** Admin → find them → *Issue reset link* →
copy → hand it over. One-time, 48 hours. Using it signs out all their other
devices.

**Somebody is locked out.** Five failed sign-ins locks an account for 15
minutes. It clears itself, or an admin clicks *Unlock account*.

**Somebody lost their phone.** Admin → *Sign out all devices*. Every session on
that account stops working on the next request.

**Somebody left.** Untick **Active**. Nothing is deleted, their work stays
attributed, and their sessions stop resolving.

## Backups

TiDB Cloud Serverless takes automatic backups — **confirm the retention window
in the console**, it is not generous forever.

On top of that, once a month: Admin → **Export everything (JSON)** → drop the
file in the team Drive. It takes ten seconds and it is the thing that saves you
if a free-tier surprise erases seven months of work.

The export excludes password hashes and session tokens by design, and file
entries are links — export the Drive folders separately.

## Render free tier

Free web services **sleep after ~15 minutes of inactivity** and take 30–60
seconds to wake. Fine during planning. Not fine on event morning.

Two options for February–March 2027:

1. **Render Starter (~$7/month)** for those two months. Recommended.
2. Have somebody open the portal at 06:30 on both event days and wait out the
   cold start.

## Event day

- The run sheet, judge list, floor map and emergency contacts should be
  **printed** before the event. Event-day mode is built to be printable — the
  navigation and forms are hidden in print styles.
- Check-in is one tap. Staff should be shown it at the briefing the night
  before, not at 07:00 on the day.
- The incident log is Admin-only. Anyone can file; only Administration reads.
- If the portal is unreachable, paper is the fallback. Plan for it rather than
  hoping.

## Health and deploys

`/api/health` is the first thing to open when something looks wrong. It reports
two different things, because they fail separately:

| Response | Meaning |
| --- | --- |
| `{"status":"ok","database":"up","schema":"ready"}` | Fine |
| `503 {"database":"down"}` | TiDB is unreachable — the cluster, the URL, or TLS |
| `{"status":"degraded","schema":"missing"}` | TiDB answers, but the tables were never created. Redeploy |

That last one is the failure worth knowing: an empty database answers `SELECT 1`
perfectly, so the service looks healthy right up until somebody opens a page
that reads a table and gets `P2021: The table 'users' does not exist`.

Deploys are automatic from `main`. Migrations run in the build step, so a
migration failure fails the build rather than half-breaking a running service —
and `npm start` runs `db:bootstrap` again before Next starts, so a service whose
build command is missing the migration step still repairs itself on the next
deploy.

**Deploying does not sign anyone out.** Sessions live in the database and do not
depend on the build or on `AUTH_SECRET`. Ship whenever.

## When things go wrong

| Symptom | First thing to check |
| --- | --- |
| Everyone sees a 503 | `/api/health` — is `database` `down`? Then TiDB, not Render |
| Slow first load in the morning | Free-tier cold start. Expected; see above |
| One person cannot sign in | Are they locked out? Is their account Active? Is the email `@kmids.ac.th`? |
| A build fails | Read the migration step first — that is where it usually is |
| `P2021: The table 'users' does not exist` | Migrations never ran. Check `/api/health` for `schema: "missing"`, then redeploy — the start command applies them. If it keeps happening, the service's build command is missing `npm run db:bootstrap` (see the README) |
| `P1003: database does not exist` | The database itself was never created. In TiDB Cloud → SQL Editor: `CREATE DATABASE hackathon_studio;` |
| Nobody can sign in on a brand-new deploy | Nobody has a password yet. The bootstrap owner invite link is printed in the deploy log on every boot until somebody does |
| `1105: Connections using insecure transport are prohibited` | TiDB rejecting a non-TLS connection. The URL needs `?sslaccept=strict`; the portal now appends it to any `*.tidbcloud.com` string automatically, so this means an old build — redeploy |
| Somebody deleted something | Nothing is hard-deleted. It is in the recycle bin |

## Handover to 2028

This is the module that breaks the yearly rebuild cycle, so do not skip it.

1. After the event, export everything and put the file in a Drive folder the
   school owns — not a personal account.
2. Two people must hold T4. Transfer one to whoever leads 2028.
3. Everything already carries a `year` column, so the 2028 team can browse 2027
   read-only while starting clean.
4. Write down what actually happened — which departments used the portal, which
   ignored it, what you would build differently. That is worth more to the next
   team than the code.
