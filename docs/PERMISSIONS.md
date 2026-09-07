# Permissions

Every read and write passes through `can(user, action, resource)` in
`src/lib/policy.ts`. There is no second place where access is decided.

MySQL has no row-level security, so the database will return any row the
application asks for. Hiding a button is not security, and neither is a
`WHERE departmentId = ?` that somebody forgets to write. If a page or an action
touches data, it calls a guard first.

## Tiers

Cumulative — each tier includes everything below it.

| Tier | Who | Can do |
| --- | --- | --- |
| **T0 Advisor** | Teachers, KMIDS staff | Read broadly, comment, approve documents and assignments. Cannot create, edit, assign or delete anything. |
| **T1 Member** | Everyone else on a team | Create work in their own department, edit what is assigned to them, own their documents and files, comment. |
| **T2 Head** | The head of each team | Everything in their own department: assign, approve, publish, delete, announce. Read-only everywhere else. |
| **T3 Admin** | Deputy director, timeline/ops manager | Full read/write across every department. Move people, publish all-staff announcements, read the incident log and the audit log. |
| **T4 Owner** | Event director + one technical backup | Everything in T3, plus accounts and tiers, invites, password resets, session revocation, export and archive. |

Two people should hold T4 from the start. A single owner is a
single point of failure for the whole portal.

## Roles, and the tier each one carries

The staff chart lives in `TEAMS` in `src/lib/constants.ts`. It is one list,
and it does three jobs: it seeds the departments, it fills the role dropdowns
in Admin, and it says which tier a role implies. Picking "Graphics Head" in
Admin therefore moves the account to T2 as well — a head who cannot approve
their own team's work is a mismatch that only gets noticed the week of the
event.

| Team | Seats | Roles → tier |
| --- | --- | --- |
| Management | 3 | Event Director → T4 · Deputy Director → T3 · Timeline/Ops Manager → T3 |
| Marketing | 3 | Marketing Head → T2 · Marketing → T1 |
| Accounting | 1 | Accounting Head → T2 · Accounting → T1 |
| Sponsors & Partnerships | 3 | Sponsorship Head → T2 · Partnership Liaison → T1 |
| Graphics | 5 | Graphics Head → T2 · Graphic Designer → T1 |
| Judging Coordination | 3 | Judging Head → T2 · Judging Coordinator → T1 |
| MCs | 3 | MC → T1 |
| Documentation, Rubric & Registration | 4 | Documentation Head → T2 · Documentation & Rubric → T1 · Registration → T1 |
| Social Media | 3 | Social Media Head → T2 · Social Media → T1 |
| Floaters | 3 | Floater → T1 |
| Advisors | — | Advisor → T0 |

The tier a role implies is a **suggestion the admin can override**, and it is
still bounded by the rules in `setUserTier`: nobody hands out a tier above
their own, and nobody demotes somebody above them. Seats are the planned
headcount, not a limit — a team can run over it.

## Flags

Not tiers — toggles on a user, set from Admin.

| Flag | Effect |
| --- | --- |
| `isReserve` | Reserve / floating staff. Appears on the event-day deployment board. |
| `isMentor` | D-Day mentor. |
| `isAlumni` | **Read-only, whatever the tier says.** For 2026 members kept for reference. |
| `isActive` | Off = suspended. No sign-in, and existing sessions stop resolving. |

## What each tier can do

Read as: *can this person do X to a resource in **their own** department?*

| Action | T0 | T1 | T2 | T3 | T4 |
| --- | :-: | :-: | :-: | :-: | :-: |
| Read anything across departments | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comment | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create a task in own department | — | ✅ | ✅ | ✅ | ✅ |
| Edit a task assigned to them | — | ✅ | ✅ | ✅ | ✅ |
| Edit someone else's task | — | — | ✅ | ✅ | ✅ |
| Assign work to other people | — | — | ✅ | ✅ | ✅ |
| Approve / mark Done | ✅¹ | — | ✅ | ✅ | ✅ |
| Delete (to the recycle bin) | — | own | ✅ | ✅ | ✅ |
| Announce to own department | — | — | ✅ | ✅ | ✅ |
| Announce to all staff | — | — | — | ✅ | ✅ |
| Read the incident log | — | — | — | ✅ | ✅ |
| Read the audit log | — | — | — | ✅ | ✅ |
| Interview scores, performance notes | — | — | — | ✅ | ✅ |
| Move people between departments | — | — | — | ✅ | ✅ |
| Invites, tiers, password resets | — | — | — | — | ✅ |
| Revoke sessions | — | — | — | — | ✅ |
| Export everything · archive mode | — | — | — | — | ✅ |

¹ Advisors may approve documents and assignments — that is the one write-shaped
thing they can do — but nothing else.

**Cross-department:** a T2 Head has no write access outside their own
department. Not to approve, not to assign, not to delete. Only T3 and above
write across the boundary.

## Decision D1

Advisors do **not** see interview scores or internal performance notes. Those
sit behind `view_private_notes`, which requires T3. It is tested explicitly.

## Re-running the audit

```bash
npm test
```

23 cases covering every tier against every action, plus the boundaries that
matter: cross-department writes, members approving their own work, heads
broadcasting to all staff, alumni write attempts, and signed-out access. When a
rule changes, the test changes with it — that is the point of keeping the policy
free of I/O.


---

## Where the rules are enforced

`src/lib/policy.ts` is the only module that decides anything. Everything else
is a caller:

| Caller | What it does |
| --- | --- |
| `requireViewer()` | signed in, or redirect to `/login` |
| `requireTier(tier)` | at least this tier, or bounce with `?denied=1` |
| `assertCan(...)` | throws in a server action, where a redirect would be swallowed |
| `can(...)` | the plain predicate — used by pages to filter lists and hide controls |

Three habits keep this honest, and all three are load-bearing:

1. **Index pages filter through `can()`, not through the `WHERE` clause.** A
   query that hard-codes a department is a second copy of the rules that will
   drift from the first.
2. **Detail pages re-check for themselves.** Reaching `/documents/<id>`
   directly must not depend on an index having filtered it out. Where the
   viewer may not read it, the answer is `404` — a `403` confirms it exists.
3. **A hidden control is not a permission.** The Event Day panel can be hidden
   from the navigation; `/event` still checks who is asking, because anybody who
   visited it once has the URL.

## What a server action re-checks

A server action is a public HTTP endpoint. Its TypeScript signature is a
compile-time claim about arguments that arrive over the wire, so every action
re-derives:

- enum arguments against their allowlist (`status`, `tier`, flag names)
- that referenced rows exist and are not soft-deleted
- that ids in a form body belong to real, active accounts
- that a department change is permitted **in the destination**, not just the
  source
- that the actor's tier is at least the tier being granted, in both directions
