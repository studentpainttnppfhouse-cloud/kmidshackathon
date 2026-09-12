# Security

What the portal defends against, how, and what it deliberately does not.

The threat model is a school staff portal: a few dozen accounts, all students
and teachers, holding coursework-grade data plus contact details for minors.
The realistic attacks are an account takeover from a reused password, a
curious student reading another department's private notes, and a stolen
database backup. Not a targeted APT. Every decision below is sized to that.

---

## Identity

**Passwords** are hashed with bcrypt at cost 12 (`src/lib/auth.ts`). Cost 12 is
roughly 250ms per verification on Render's free tier — slow enough to make
offline cracking expensive, fast enough that sign-in does not feel broken.
bcryptjs is pure JavaScript, so a build can never fail on a native module with
no prebuilt binary for the runtime image; the trade against argon2's memory
hardness is documented in `docs/ARCHITECTURE.md`.

Minimum length is 10 characters and there is no composition rule. Length beats
symbol soup, and a rule that forces `P@ssw0rd!` produces `P@ssw0rd!`.

**Sessions** are opaque bearer tokens, not signed payloads (`src/lib/session.ts`).
The browser holds 32 random bytes; the database holds their SHA-256 hash.
Validating a request is a hash plus an index lookup — no application secret is
in the path, which is why a redeploy or a rotated `AUTH_SECRET` cannot sign
anybody out. Only expiry, an explicit sign-out, or an owner revoking it ends a
session.

The cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`,
and persistent for 180 days sliding. One definition of those options
(`sessionCookieOptions()`) is shared by creation, renewal and deletion, so the
renewal path cannot drift and quietly drop a flag.

**Sign-out revokes server-side.** Replaying a captured cookie after sign-out
gets you the login page — there is a browser test for exactly that.

## Getting in

Registration is invite-only. There is no public sign-up, no self-service
password reset, and no email service in the deployment — an owner generates a
one-time link in the admin panel and hands it over directly.

Invite and reset codes are 24 random bytes (`base64url`). Both are single-use
and claimed with a conditional `updateMany`, so two browsers posting the same
link cannot both succeed. Reset also revokes every other session on that
account.

Sign-in is restricted to `@kmids.ac.th` (overridable per deployment), checked
on the server on every attempt. The browser-side copy of that domain is a
placeholder, nothing more.

## Throttling and bots

Three layers, because each covers what the others cannot:

| Layer | Catches | Misses |
| --- | --- | --- |
| Per-account lockout (5 fails → 15 min) | grinding one password | a spray across many accounts |
| Per-address rate limit (`src/lib/rate-limit.ts`) | a spray, and code guessing | a distributed attempt |
| Honeypot + fill timing (`src/lib/request.ts`) | commodity credential stuffing | anyone who reads the HTML |

Per-account lockout on its own is also a denial-of-service: anyone who knows a
teammate's address could lock them out five requests later. Throttling the
source is what makes that expensive.

The rate limiter keeps state in process memory. The portal runs as one Render
instance, so that is accurate today; scaled to several it becomes per-instance
— still a bound, and the account lockout underneath does not depend on it. A
Redis dependency for a six-person portal costs more than it protects.

Neither bot check is a CAPTCHA and neither is claimed to be. They cost a
determined attacker one line of code each, and they cost the people who work
here nothing — which a CAPTCHA very much does.

## Authorisation

One module decides everything: `src/lib/policy.ts`. TiDB has no row-level
security, so the database will return any row the application asks for. Every
read and every write therefore goes through `can()` — pages included, not just
actions. Hiding a button is not access control.

Rules that matter:

- Reading across departments is deliberate; the portal exists to be a shared
  view. Writing is scoped to your own department.
- Approving is a separate permission from editing, so a member cannot mark
  their own work approved.
- Interview scores and internal notes are T3+ only. Advisors read broadly and
  never see them.
- The incident log is admin-only.
- Phone numbers and LINE IDs are visible only to their owner and to admins.

Detail pages re-check for themselves rather than trusting that an index
filtered — a URL is guessable, an index is not the gate. Where a resource
exists but is not readable, the response is `404`, not `403`: a 403 confirms
the thing exists.

### Values from the browser are claims, not facts

Every server action re-derives what it needs:

- Enum arguments (`status`, `tier`, a flag name used as a column key) are
  checked against their allowlist at run time. A TypeScript signature is not a
  run-time check; a server action is a public HTTP endpoint.
- Moving a record between departments is treated as a *create in the
  destination*, not an edit in the source. Without that, "update your own
  document" is a way to file work into any department in the portal.
- Assignee ids are checked to be real, active accounts — TiDB does not enforce
  foreign keys under `relationMode = "prisma"`, so a bogus id inserts cleanly
  and produces work assigned to nobody.
- Nobody grants a tier they do not hold, in either direction: an admin cannot
  mint an owner, and cannot demote somebody above them to take the account over.
- Form responses are validated against the form definition — required-ness,
  option membership and every length cap decided again on the server.
- The profile form writes a hand-listed set of columns, so an extra
  `<input name="tier">` in the posted body means nothing.

## Injection and output

**SQL**: every query goes through Prisma's query builder, which parameterises.
The two `$queryRaw` uses (the health check and the bootstrap script) are
tagged templates with no interpolated user input.

**XSS**: React escapes by default and the portal renders no author-supplied
HTML. Documents are stored as Markdown and rendered by `src/lib/markdown.ts`,
which escapes every character of the input *before* interpreting any Markdown
syntax — so an author's `<script>` is already five harmless characters by the
time a tag could be produced. There is no raw-HTML passthrough.

**Links are the other injection point**, and were the one real vulnerability
found in this codebase: `z.string().url()` accepts `javascript:alert(...)`,
because that is a valid URL. Every link now goes through an http/https
allowlist (`src/lib/url.ts`), applied both on write and again at render
(`safeHref`), so a row written before the check existed degrades to a dead
link rather than an executable one.

**Filenames** in `Content-Disposition` are rebuilt from a character allowlist,
because a quote or newline in a document title is header injection.

## Transport and headers

`src/middleware.ts` runs on every request:

- Plain HTTP is refused with a 308 to `https://` (localhost exempt, so a
  production build can be verified locally).
- HSTS: two years, `includeSubDomains`, `preload`.
- A nonce-based Content-Security-Policy — `strict-dynamic` in production, so
  the allowlist stops mattering once the nonced bundle loads and an injected
  tag inherits nothing. `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'` (an injected form cannot exfiltrate a password field),
  `frame-ancestors 'none'`.
- `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, a `Permissions-Policy`
  turning off camera, microphone, geolocation and payment.
- `Cache-Control: no-store` on everything that is not a static asset, because
  signed-in pages are per-person and a shared cache holding one is a data leak.

## Data at rest

Phone numbers and LINE IDs are encrypted with AES-256-GCM before they reach the
database (`src/lib/crypto.ts`), keyed from `AUTH_SECRET`. This protects a
*stolen database* — a dumped table, a leaked backup, a careless export — which
is the realistic threat. It does not protect against an attacker who already
has the running app, and does not claim to.

Reads tolerate plaintext, so rows written before this existed still display and
get encrypted the next time their owner saves. With no `AUTH_SECRET` set,
writes stay plaintext and log a warning once: a local checkout must still run,
and silently storing something the deployment cannot decrypt is worse than
storing it in the clear knowingly.

Teams webhook URLs go through the same encryption. A webhook URL *is* a
credential: anybody holding one can post into a staff channel as the portal,
indefinitely, with no further check. It is never rendered back to a browser —
the admin screen shows the host and the last four characters — and never written
into the audit trail.

## Outbound requests

The Teams integration is the one place the server fetches a URL a person typed
in, which makes it the one place SSRF is possible. Every other link in the
portal is rendered for a browser to follow and is covered by `isSafeUrl()`.

A webhook URL is therefore allowlisted by host suffix rather than filtered for
badness (`src/lib/teams/config.ts`): `webhook.office.com` and `logic.azure.com`,
plus whatever `TEAMS_WEBHOOK_HOSTS` adds for a sovereign cloud. That setting can
only add, so a stray value cannot replace the list with something permissive. An
admin who pastes `http://169.254.169.254/latest/meta-data/` — by mistake, or
because somebody told them it was the new Teams URL — is refused.

Three further properties, each closing a way around the allowlist:

- **https only.** A webhook URL travels in the request; plain HTTP would put a
  credential on the wire.
- **Redirects are an error, not a hop.** The allowlist checks the URL the portal
  chose. `redirect: "error"` is what stops the far end choosing the next one.
- **Checked twice** — once in the form for a readable error, once inside the
  sender, so a row written before the check existed is still refused.

Message bodies are stripped of angle brackets before they reach an Adaptive
Card, so text a person typed cannot forge an `<at>` mention and make the portal
appear to have pinged somebody it did not. Display names are stripped the same
way, so a profile field cannot close the mention tag early. Both are tested.

The dispatcher (`/api/teams/dispatch`) is an HTTP endpoint because Render's free
plan has no cron, so a shared bearer secret is the whole of its authentication.
It is compared in constant time, an absent secret disables the route entirely
rather than leaving it open, and a wrong secret and a missing one get the same
response — a 401 that distinguishes them tells somebody probing that they have
found a real endpoint worth guessing at.

## Uploads

Files are stored in the database, never on disk. There is no uploads directory,
no temp file and no path to traverse — the bytes go from the Server Action into
`attachment_chunks` and come back out through one route handler.

Four rules keep a file somebody uploaded from becoming a page on this origin,
which is the origin holding everybody's session cookie:

1. **The extension decides the type, not the browser.** `File.type` is a
   string the client chose. An unrecognised extension is stored as a byte
   stream even when the browser insists it is a PNG, which closes the "upload
   markup, declare it an image" path (`safeMimeType`, `tests/attachments.test.ts`).
2. **Only images and PDFs may render inline.** Everything else — HTML, SVG,
   anything unknown — comes back as `application/octet-stream` with
   `Content-Disposition: attachment`, whatever it claimed to be. SVG is
   excluded deliberately: it is an image that carries `<script>`.
3. **`nosniff`, plus a policy of its own.** Attachment responses carry
   `default-src 'none'; sandbox`, set in `src/middleware.ts` because the
   middleware's header is the one that survives — a policy written only in the
   route would be replaced by the ordinary page policy.
4. **Filenames are stripped, not escaped.** Path separators, control
   characters and quotes are removed before a name reaches a
   `Content-Disposition` header, so a filename cannot split a response header
   or imply a directory.

Authorisation is re-derived from the attachment's parent on every request via
`src/lib/attachment-access.ts`; an attachment id is not a capability. A request
with no session, for a file that does not exist, or for one the viewer may not
read all answer the same 404.

Uploads are capped at `MAX_UPLOAD_MB` (default 10 MB, hard-capped at 20),
checked in the browser, again against the bytes actually received, and again by
the Server Action body limit. Over the cap, the attachment is recorded as a
link instead.

## Join links

A join link is a bearer token that ends up on a poster, so it is bounded rather
than trusted: the KMIDS email domain still applies, no link may grant above
`JOIN_LINK_MAX_TIER` (a link can never mint an admin), uses and expiry are
re-checked at registration with the use claimed by a conditional `updateMany`,
and revoking one kills every printed copy at once.

An address that already has a password is refused outright — a join link
registers new accounts and can never take over an existing one — and
`users.joinedViaLinkId` records which link each account came through.

## Secrets

Nothing secret is in the repository and nothing secret reaches the browser.
`git log -p` was searched across all history for connection strings, private
keys and API tokens: the only matches are the placeholders in `.env.example`,
`README.md` and a test fixture, all obviously fake.

`DATABASE_URL`, `AUTH_SECRET` and `OWNER_EMAIL` are set on the Render service.
No variable is prefixed `NEXT_PUBLIC_`, so Next inlines none of them into the
client bundle. There is no public/anon database key because there is no
client-side database access at all: the browser talks to the app, the app talks
to TiDB.

## Dependencies

`npm run audit` fails the build on a high or critical advisory in a *runtime*
dependency; CI also runs it weekly, because an advisory can land against code
nobody has touched. Dev-only advisories are reported but do not fail a release
— they affect a laptop running `next dev`, not the deployed portal, and
blocking on one means the next real finding gets ignored too.

At the time of writing: **0 vulnerabilities** in runtime dependencies.

## Auditing

Every state-changing action writes to an append-only `audit_log` — who, what,
when, and the target. It never contains passwords, tokens or reset codes, only
their existence. An audit write can never take down the action it is recording.

## Known limits

Stated plainly, because a security document that claims completeness is not
one:

1. **The rate limiter is per-instance.** Scaling past one Render instance
   multiplies the effective limit by the instance count.
2. **No second factor.** For a portal with no financial or medical data,
   behind an invite-only door, TOTP would be enrolment friction that gets
   worked around. Reconsider if the tier list ever includes a real budget.
3. **Field encryption does not defend a compromised app.** By construction.
4. **Invite and reset codes are stored in plaintext**, so an admin can copy the
   link out of the panel to hand over. They are 192 bits of entropy, single-use
   and short-lived; hashing them would make the panel unable to show them.
5. **No email means no notification of a password change** to its owner. An
   admin-issued reset is a deliberate, in-person act.
6. **A Teams webhook URL cannot be un-leaked by the portal.** It is encrypted
   at rest and never displayed, but the person who pasted it in had it in their
   clipboard, and revoking one means deleting the webhook in Teams — which the
   portal cannot do on your behalf.
7. **Notifications are queued, not instant.** A message goes out on the next
   dispatch run, not the moment it is written. That is the right trade for a
   moved deadline and the wrong one for a fire alarm; the composer says so
   rather than implying otherwise.
8. **PDF export is Latin-only.** Base-14 PDF fonts are WinAnsi-encoded, so Thai
   text is dropped from a PDF rather than mangled. `.docx` and `.md` are
   Unicode and carry it correctly; the export page says so at the point of
   choosing.

## Reporting

Found something? Tell the portal owner directly — LINE or in person — rather
than opening a public issue.
