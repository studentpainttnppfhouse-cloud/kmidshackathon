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

## Files: uploads in the database, links over the limit

The original decision (D2-1) was links only. Render's free tier has an
ephemeral filesystem — anything written to disk is gone on the next deploy — so
the file library stored **metadata plus a Drive or Canva link** and nothing
else.

The first half of that reasoning still holds. The conclusion did not: the disk
was never the only place to put a file. TiDB survives every redeploy the disk
does not, so bytes now go there, in 256 KB rows in `attachment_chunks`, with
one `attachments` row carrying the name, the sanitised MIME type, the size and
a SHA-256.

| | Where the bytes are | When |
| --- | --- | --- |
| Upload | `attachment_chunks` in TiDB | Up to `MAX_UPLOAD_MB` (default 10 MB) |
| Link | Drive, Canva, wherever | Anything larger, and anything already there |

The upload path is chunked rather than one big blob for two reasons: TiDB caps
the size of a single transaction entry, and a download streams one chunk at a
time so a 10 MB file never costs 10 MB of heap on a 512 MB instance.

Attachments hang off a parent (`parentType` + `parentId`) and store **no
permission of their own**. Every read and every write re-derives it from that
parent through `src/lib/attachment-access.ts`, which calls the same
`src/lib/policy.ts` everything else calls. A task that moves department takes
its files with it, and there is no second copy of the rules to keep in step.

Object storage (R2 or S3) is still the upgrade path if the free TiDB tier ever
runs short; it adds three or four credentials, which is why it is not the
starting point.

## Joining: one link and one QR code

`Invite` names one email address and burns itself on first use. That is the
right tool for one person and the wrong one for a room of sixty at the first
staff meeting, so `InviteLink` is the other half: one code, printed on a poster
or shown on a projector, that registers whoever scans it.

The safety of that shape rests on four things, all enforced server-side in
`src/lib/actions/join-links.ts`:

1. the KMIDS email domain, exactly as the login gate enforces it;
2. `JOIN_LINK_MAX_TIER` — no join link may ever grant an admin account,
   whoever created it and whatever the stored row says;
3. uses and expiry, both re-checked at the moment of registration, with the
   use claimed by a conditional `updateMany` so two phones scanning at once
   cannot both take the last seat;
4. `revokedAt`, which kills every printed copy at once.

`users.joinedViaLinkId` records which link an account came through, so a link
that turns out to have leaked can be traced rather than guessed at.

QR codes are rendered server-side as a single inline SVG `<path>` (see
`src/lib/qr.ts`). No canvas, no image request, no client bundle, and nothing
for the Content-Security-Policy to make an exception for.

## Documents: both, and the author picks

The original decision (D3-A) was metadata here, bodies in Google Docs — the
portal stores title, owner, department, status, tags and the link; Google keeps
the content along with real-time collaboration, comments, suggestion mode,
offline and mobile. The cost was that **search could not see document bodies**,
and that every document required a Google account and a share setting somebody
had to get right.

That is now one of two options rather than the only one (D3-B). A document is
either `source = "external"` — the original behaviour, unchanged — or
`source = "portal"`, written here and stored as Markdown in TiDB. Portal
documents are searchable by their contents, attach to a task as the submission
for it, and export to `.docx`, `.pdf` and `.md`.

**Why Markdown and a textarea, not a rich-text editor.** A contenteditable
editor stores HTML. Storing HTML written by a user and rendering it back is the
exact shape of a stored-XSS bug, and defending it means a sanitiser that has to
keep winning forever against every new parser quirk. Markdown stores text, and
`src/lib/markdown.ts` escapes every character before it interprets any syntax —
so the renderer is the only thing that can produce a tag. The live preview runs
that same renderer, so what the author sees is what the document is.

**Why the exporters have no dependencies.** A `.docx` is a ZIP of XML parts, so
producing one needs a ZIP writer (~120 lines, `src/lib/export/zip.ts`) and
nothing else; `jszip` would be 100kB of general-purpose archive code to write
four small files that are always known in advance. A PDF is an object table
with a byte-offset index, so `src/lib/export/pdf.ts` writes one directly using
the base-14 fonts every reader has built in — no headless Chromium in a 512MB
instance, no embedded font binaries, no licences. The limitation that buys is
stated where it matters: base-14 fonts are WinAnsi, so PDF export is Latin-only
and Thai text goes out as `.docx` or `.md` instead.

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


## Forms: built here, answered here

Google Forms was replaced rather than wrapped, for one reason that is not about
features: the responses were leaving the school's control and landing in
whichever personal Drive happened to own the form. A form is now a `schema` JSON
column and its answers are `form_responses` rows, so the data stays where the
rest of the portal's data is, and the same `can()` rules decide who reads it.

The question list is edited in React state and posted as one JSON field, because
a tree does not survive a flat form body. That JSON is parsed with the same zod
schema an attacker's hand-written payload would face — being generated by our
own UI earns it nothing.

## Rendering and the CSP

`src/middleware.ts` generates a nonce per request and Next picks it up for its
own bundles, which is what lets the production policy be
`script-src 'self' 'nonce-…' 'strict-dynamic'` rather than `'unsafe-inline'`.

The one inline script in the app is the theme setter in the document head, and
it carries that nonce. It is inline on purpose: anything asynchronous paints the
light theme first and corrects itself a frame later, and that flash is worse on
a phone in a dark room than any amount of purity about inline scripts.

## Loading states

Every route has a `loading.tsx` whose skeleton mirrors the shape of the page it
stands in for — cards where cards will be, rows where rows will be. A skeleton
that does not match causes a visible jump when the real content lands, which
reads as a second, worse glitch than the blank screen it replaced.
