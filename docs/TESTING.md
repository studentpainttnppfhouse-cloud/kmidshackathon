# What has been verified

Two suites. The unit suite needs nothing but Node; the browser suite drives the
real app against a real MySQL database in a real Chromium.

```bash
npm test          # unit — no database needed
npm run typecheck
npm run build
npm run audit     # runtime dependency advisories

# browser suite: needs a database and a running server, see below
npm run test:e2e
```

---

## Unit suite — 126 tests, all passing

`npm test`

### Permission audit (`tests/authorize.test.ts`)

Every tier against every action, including the cases most likely to leak:

- a T2 Head approving, assigning or deleting in **another** department → denied
- a T1 Member editing a task assigned to somebody else → denied
- a T1 Member approving their **own** work → denied
- a T2 Head broadcasting an all-staff announcement → denied
- a T2 Head sending a Teams notification to another department → denied
- a T2 Head touching a Teams webhook URL → denied
- a T1 Member or advisor sending any notification → denied
- an alumni account with a T3 tier attempting any write → denied
- an advisor creating, editing, assigning or deleting → denied
- advisors reading interview scores and performance notes (D1) → denied
- a signed-out visitor doing anything at all → denied

### Teams notifications (`tests/teams.test.ts`)

The parts that would fail quietly, checked without a network:

- the webhook host allowlist — an SSRF control, so it gets the awkward cases:
  the cloud metadata address, `logic.azure.com.evil.example` (a host that merely
  *contains* an allowed one), plain http on an allowed host, a URL carrying
  credentials, and `javascript:` / `data:` / `file:`
- a message body containing `<at>Head of Graphics</at>` produces no mention
  entity, so text cannot forge a ping
- a display name of `</at><at>Someone Else` cannot close the mention tag early
- only `http(s)` URLs become a card button
- `08:00` on a run sheet is 01:00 UTC, not 08:00 UTC — seven hours wrong would
  send every event reminder in the middle of the night

### Link safety and rendering (`tests/export.test.ts`)

- `javascript:`, `data:`, `vbscript:`, `file:` and whitespace-obfuscated
  variants (`java\tscript:`) → all rejected by the URL allowlist
- Markdown containing `<img onerror=…>` and `<script>` → escaped to text, no
  tag produced, real Markdown formatting still applied
- a Markdown link with a `javascript:` target → left as literal text, never an
  `<a href>`
- `.docx` output → unzipped and its parts checked; document text containing
  `</w:t></w:r>` and `&` is escaped rather than closing a tag
- `.pdf` output → header, `startxref`, and every cross-reference offset checked
  to point at the object it claims; parentheses in a title escaped so they
  cannot truncate the content stream

### Form definitions and responses (`tests/forms-schema.test.ts`)

- a required answer left out → refused
- a choice not in the option list → refused (the devtools attack)
- checkbox answers checked individually against the list
- numbers, dates and emails shape-checked server-side
- length caps enforced server-side, not by `maxlength`
- **fields the form never asked for are dropped, not stored** — a response
  cannot introduce columns of its own
- a corrupt definition returns `null` rather than throwing, so one bad row
  cannot take down the forms index

### Field encryption (`tests/crypto.test.ts`)

- round trip; the stored value is never the plaintext
- the same value encrypts differently every time — a deterministic ciphertext
  would reveal which two students share a phone number
- plaintext written before encryption existed still reads back
- a tampered ciphertext returns `null` rather than throwing
- Thai text survives
- `safeEqual` returns false for different lengths instead of throwing

### Rate limiting (`tests/rate-limit.test.ts`)

- normal use passes, a burst blocks, the block persists
- **keys are independent** — one address cannot lock another out
- a successful sign-in clears the record
- the shipped limits leave room for a person mistyping a password three times

### Connection strings (`tests/database-url.test.ts`)

TiDB TLS normalisation, including passwords containing `?` and `#`.

### Department colour legibility (`tests/color.test.ts`)

Department colours are staff-chosen and end up behind white text, and several
of the seeded ones — `#F59E0B`, `#22C55E`, `#2DD4BF` — were 2:1 against it.

- every seeded colour, plus black, white, mid-grey and pure yellow, clears
  4.5:1 once deepened
- a colour that already passes is returned byte-for-byte unchanged
- deepening holds the hue: amber stays amber, green stays green
- a missing or malformed colour falls back to the theme's brand pairing rather
  than to `undefined`, which would render white on white

---

## Browser suite — 50 tests

`npm run test:e2e`, against a server you have already started.

```bash
# 1. a database
export DATABASE_URL="mysql://user:pass@127.0.0.1:3306/hackathon_studio"
export AUTH_SECRET="$(openssl rand -base64 32)"
export OWNER_EMAIL="you@kmids.ac.th"
npx prisma migrate deploy
npx tsx prisma/seed.ts        # prints the bootstrap invite code

# 2. the app, built the way it deploys
npm run build
NODE_ENV=production npx next start -p 3210

# 3. the tests
BASE_URL=http://127.0.0.1:3210 E2E_INVITE_CODE=<code> npm run test:e2e
```

### Authentication

| Check | Result |
| --- | --- |
| Accepting an invite creates the account and signs it in | Pass |
| Wrong password vs. nonexistent account | Identical message — no enumeration |
| Non-`@kmids.ac.th` address | Refused server-side |
| Honeypot filled, password correct | Refused, and told nothing useful |
| Session cookie | `HttpOnly`, `SameSite=Lax`, `Path=/`, ~180 days |
| `document.cookie` | Does not contain the session |
| **Replaying a cookie after sign-out** | Redirected to `/login` — revoked server-side, not just dropped |

### Authorisation

| Request | Result |
| --- | --- |
| `/dashboard`, `/admin`, `/documents`, `/search`, `/people/import` with no cookie | `307` → `/login` |
| `/api/export` with no cookie | `403` |

### Injection

| Attempt | Result |
| --- | --- |
| `javascript:` in a document link field | Refused with a readable error |
| `<img src=x onerror=…>` and `<script>` in a document body | Rendered as text; `window.__xss` stayed `undefined`; zero `<img>` and zero `<a>` created; `**bold**` still worked |
| A radio value rewritten in devtools to a non-option | Refused: "not one of its options" |

### Documents and forms

- a portal document downloads as `.docx` (starts `PK`), `.pdf` (starts
  `%PDF`), and `.md` — all three clicked as real links, so the real
  `Content-Disposition` path is exercised
- the editor's preview renders through the same renderer that saves
- a built form is filled in and the answer appears in the owner's response table

### Contrast (`tests/e2e/contrast.spec.ts`)

Eleven pages, in both themes, audited in the browser rather than by eye. Every
text node on the page is measured against the background actually behind it —
compositing translucent ancestors, so an `/70` fill on a card on a page
resolves correctly — and checked against WCAG 2.1 AA: 4.5:1, or 3:1 for large
text.

Text over a gradient or an image is reported as unmeasurable rather than
guessed at, since `getComputedStyle` returns the gradient's declaration and not
the pixel under the word.

| Page | Light | Dark |
| --- | --- | --- |
| `/dashboard`, `/assignments` (board and list), `/people`, `/documents`, `/departments`, `/announcements`, `/forms`, `/files`, `/brand`, `/help` | Pass | Pass |

This is the test that stops the dark theme regressing the way it did before:
one component written with a light-mode-only Tailwind pair (`bg-white`,
`bg-emerald-50 text-emerald-700`) is invisible to any amount of
`:root[data-theme]` work, and only shows up when something measures the
rendered page.

### Interface

| Check | Result |
| --- | --- |
| Dark mode applies, survives a reload with no flash of light theme | Pass |
| First `Tab` on any page lands on "Skip to content" | Pass |
| Mobile menu opens and closes at 390px | Pass |
| **No horizontal overflow at 390px** on dashboard, documents, forms, people, brand, search | Pass |
| Cookie notice shows once, stays dismissed, and does not cover the submit button | Pass (this was a real bug the suite found) |
| Password reveal / re-hide | Pass |
| Delete asks first; Escape cancels without deleting | Pass |
| UTM parameters captured to `sessionStorage` and stripped from the address bar | Pass |
| Back-to-top appears after scrolling | Pass |
| FAQ expands | Pass |
| A 20-shade colour ramp generates and the Brand Kit exports as PDF | Pass |

---

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

---

## Headers, checked on the wire

`curl -sD- http://127.0.0.1:3210/login`

- `content-security-policy` with a **per-request nonce**, `strict-dynamic`,
  `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `frame-ancestors 'none'`
- `strict-transport-security: max-age=63072000; includeSubDomains; preload`
- `x-content-type-options: nosniff`, `x-frame-options: DENY`
- `permissions-policy: camera=(), microphone=(), geolocation=(), payment=()…`
- `cache-control: no-store, must-revalidate` on signed-in pages

HTTPS enforcement: a request with `Host: portal.kmids.ac.th` and
`x-forwarded-proto: http` returns `308` → `https://portal.kmids.ac.th/…`
(rebuilt from the `Host` header, not from the internal origin). Localhost is
exempt so a production build can be verified locally.

---

## Migrations

Both migrations were applied from empty against MySQL 8-compatible MariaDB
10.11, in order, with no manual intervention:

```
Applying migration `20260821154608_init`
Applying migration `20260822090000_portal_documents_and_brand_tokens`
```

The second one widens `documents.externalUrl` to nullable and adds `source`,
`body` and `assignmentId`; every existing row keeps its URL and takes the
default `source = 'external'`, so nothing that already worked changes.

---

## What is not covered

Worth knowing before the event:

- **No load testing.** 40 users is nowhere near a problem, but it has not been
  measured.
- **One browser.** Chromium only. No Safari or Firefox run — worth doing before
  event day, since half the phones will be iPhones.
- **No automated accessibility audit.** Focus order, skip link, labels, roles
  and reduced-motion were built in and spot-checked by the browser suite, but
  no axe-core pass has been run.
- The Social Media Command Center is schema-only — no UI yet.
- Archive mode has a setting and an export but no read-only enforcement pass.
- Recurring tasks store the rule as text; nothing generates the next instance.
- The rate limiter is per-process, so its numbers assume the single Render
  instance the portal actually runs on.
