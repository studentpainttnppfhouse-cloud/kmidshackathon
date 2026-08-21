# What has been verified

All of the below was run against a real MySQL database with the app built in
production mode and driven through a real browser.

## Permission audit — 23/23

```bash
npm test
```

Every tier against every action, including the cases most likely to leak:

- a T2 Head approving, assigning or deleting in **another** department → denied
- a T1 Member editing a task assigned to somebody else → denied
- a T1 Member approving their **own** work → denied
- a T2 Head broadcasting an all-staff announcement → denied
- an alumni account with a T3 tier attempting any write → denied
- an advisor creating, editing, assigning or deleting → denied
- advisors reading interview scores and performance notes (D1) → denied
- a signed-out visitor doing anything at all → denied

## Sign in once — verified end to end

The requirement, tested the only way that means anything: perform a real login,
then **actually redeploy** and see whether the browser is still signed in.

1. Accepted an invite in a real browser, set a password, completed the profile,
   landed on the dashboard. Cookies saved.
2. Stopped the server, **deleted the entire `.next` build**, **rotated
   `AUTH_SECRET` to a brand-new value**, rebuilt from source, restarted.
3. Reloaded `/dashboard` with the same cookie jar.

**Result: still signed in.** No login prompt, straight to the dashboard.

That is a harder test than a Render deploy — Render keeps `AUTH_SECRET` stable
across deploys, and this passed with it rotated.

## Authentication and session properties

| Check | Result |
| --- | --- |
| Non-`@kmids.ac.th` email, browser validation bypassed | Rejected server-side |
| Wrong password vs. nonexistent account | Byte-identical message — no account enumeration |
| 5 failed attempts | Account locks for 15 minutes |
| Correct password during a lockout | Still refused |
| Another person's lockout | Does not affect an already-signed-in session |
| Session cookie | `httpOnly`, unreadable from `document.cookie` |
| Cookie lifetime | ~180 days, persistent (survives browser close) |
| Forged / random session token | Redirected to `/login` |

## HTTP-level authorization

| Request | Result |
| --- | --- |
| `/dashboard`, `/assignments`, `/admin` with no cookie | `307` → `/login` |
| `/admin` as T1 Member | Redirected to `/dashboard?denied=1` |
| `/admin/audit` as T1 Member | Redirected |
| `/api/export` as T1 Member | `403` |
| `/api/export` with no cookie | `403` |
| `/api/export` as T4 Owner | `200`, full JSON export |

## Build and runtime

- `npm run typecheck` — clean, no `any` escapes in the permission path
- `npm run build` — all 24 routes compile
- `/api/health` — `{"status":"ok","database":"up","latencyMs":6}`
- Every page rendered and screenshotted at 1440px and at 390px (iPhone width)

## What is not covered

Worth knowing before the event:

- No load testing. 40 users is nowhere near a problem, but it has not been
  measured.
- The Social Media Command Center is schema-only — no UI yet.
- Archive mode has a setting and an export but no read-only enforcement pass.
- Recurring tasks store the rule as text; nothing generates the next instance
  yet.
- Internal form *responses* have a table and an API path but no builder UI —
  external Google Forms are fully wired.

## Re-running any of it

```bash
npm test          # permission audit — no database needed
npm run typecheck
npm run build
curl localhost:3000/api/health
```
