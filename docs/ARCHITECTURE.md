# Architecture

How the portal is built, and the reasoning behind the choices that are not
obvious from the code.

## Shape

```
src/
  app/
    login/ invite/[code]/ reset/[code]/   Signed-out pages
    welcome/                              First-run profile setup
    (app)/                                Everything behind a session
      dashboard/ assignments/ departments/ people/
      documents/ files/ brand/ forms/ announcements/ event/
      admin/ settings/
    api/health/                           Render's health check
    api/export/                           Owner-only full export
  lib/
    policy.ts        Pure permission logic — no I/O, fully testable
    authorize.ts     The same policy plus the server-side guards
    session.ts       Opaque database-backed sessions
    auth.ts          Password hashing, domain rule, lockout maths
    db.ts            Prisma client (singleton across hot reloads)
    audit.ts         Append-only action log
    actions/         Server actions, one file per domain
  components/        Shared UI
prisma/
  schema.prisma      MySQL/TiDB models
  seed.ts            Departments, run sheet, bootstrap owner invite
tests/
  authorize.test.ts  The permission audit
```

Mutations are **server actions**, not REST routes. Every one begins with
`requireViewer()` and an `assertCan()` — the permission check is the first thing
in the function, not a filter somewhere downstream.

## Sessions: why not a signed cookie

The requirement was that staff sign in once and stay signed in through portal
updates. That rules out putting session state in a signed or encrypted cookie
(the JWT approach Auth.js defaults to), because every such scheme is only as
durable as the secret that signs it. Rotate `AUTH_SECRET` — or let a platform
regenerate it — and every person is signed out at once.

So the cookie carries nothing but 32 random bytes. The database stores their
SHA-256 hash, the expiry, and a last-seen timestamp. Validating a request is one
indexed lookup with no secret involved anywhere:

```
cookie ──SHA-256──▶ tokenHash ──index──▶ sessions row ──▶ user
```

Consequences, all of them intended:

- A redeploy, restart, or new instance cannot sign anyone out — nothing about
  the session lives in the process.
- `AUTH_SECRET` can be rotated freely. It is used for CSRF and cookie integrity,
  never for session validity.
- Sessions are **revocable**, which a JWT is not: an owner ends a session from
  the admin panel and the next request fails immediately.
- The token is never stored in a form an attacker with database read access
  could replay — only its hash.

Sessions run 180 days and slide forward whenever they are used more than a day
after the last renewal, so an active person's login effectively never lapses.

## Passwords: bcrypt, not argon2id

The build plan allows argon2id **or** bcrypt at cost ≥ 12. This uses `bcryptjs`
at cost 12.

argon2 is the better algorithm. But every argon2 package for Node is a native
module, and a native module is a build that can fail on a platform image the
maintainer cannot debug at 2 AM. For a portal with one maintainer, ~40 users, no
public sign-up, and invite-only accounts, a pure-JavaScript hash that always
builds is worth more than the memory-hardness margin.

Swapping later is a two-function change in `src/lib/auth.ts` plus a
rehash-on-next-login: check the stored hash's prefix, verify with the old
algorithm, and write back the new one.

## TiDB specifics

- Port **4000**, not 3306, and TLS is mandatory: keep `?sslaccept=strict`.
- `relationMode = "prisma"` — TiDB does not enforce foreign keys in every
  configuration, so relations are declared for Prisma's benefit and integrity is
  the application's job. Practically this means: no `ON DELETE CASCADE`, and
  cleanup is explicit.
- No arrays and no `JSONB`. Tag lists are plain `JSON` columns, which is why tag
  filtering on the files page happens in application code rather than in SQL.
- Migrations run at **build** time (`prisma migrate deploy` in the Render build
  command), never at request time.

## Permissions

`src/lib/policy.ts` holds `can(user, action, resource)` and nothing else — no
database, no cookies, no framework imports. That is what makes the audit in
`tests/authorize.test.ts` possible: it exercises every tier against every action
without a server or a database.

`src/lib/authorize.ts` re-exports the policy and adds the guards that pages and
actions actually call (`requireViewer`, `requireTier`, `assertCan`). See
[PERMISSIONS.md](PERMISSIONS.md).

## Files: links, not uploads

Render's free tier has an ephemeral filesystem — anything written to disk is
gone on the next deploy — and MySQL rows are the wrong place for binaries. So
the file library stores **metadata plus a Drive or Canva link**. The portal is
the index; Drive holds the bytes.

This keeps the deployment to a single external credential (`DATABASE_URL`) and
matches how the team already works. If real uploads become necessary, object
storage (R2 or S3) is the upgrade path; it adds three or four credentials.

## Documents: metadata here, bodies in Google

Same reasoning, different trade. The portal stores title, owner, department,
status, tags and the link; Google Docs keeps the content, along with real-time
collaboration, comments, suggestion mode, offline and mobile — all of which
would otherwise have to be rebuilt.

The cost is honest and worth stating: **search covers titles, descriptions and
tags, not document bodies.** A native editor was scoped and deferred; that work
is where side projects die.

## Soft deletes

Nothing is hard-deleted. Every content model carries `deletedAt`, every list
query filters on it, and an admin can restore. Students delete things by
accident.

## The `year` column

`assignments`, `documents`, `files`, `forms`, `announcements` and `incidents`
all carry `year`, defaulting to 2027. That single column is what makes the 2028
handover possible without a second database: flip the portal to archive mode,
tag the year, and the next team browses everything read-only while starting
their own clean set.
