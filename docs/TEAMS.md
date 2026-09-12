# Microsoft Teams notifications

The portal can push what changes here into Teams: deadlines that are close,
tasks that are late, announcements as they go up, and anything a head types on
the `/notifications` page.

It is off until somebody sets it up, and it degrades rather than breaks. With no
setup at all the page loads, says what is missing, and queues nothing.

---

## What it can do, and what that costs to switch on

There are two halves, and they are very different amounts of work.

| | Channel posts | Personal notifications |
|---|---|---|
| Reaches | a Teams channel | one person's Activity feed |
| Needs | a webhook URL from the channel | an Azure app registration |
| Set up by | anyone who owns the channel | a Microsoft 365 tenant admin |
| Takes | about a minute | a conversation with IT |

Start with channel posts. They cover most of what this feature is for, and they
need nobody's permission but your own.

---

## 1. Channel posts (start here)

In Teams, in the channel you want the messages to land in:

1. Click the **···** next to the channel name → **Workflows**.
2. Choose **Post to a channel when a webhook request is received**.
3. Follow it through and copy the URL at the end. It looks like
   `https://prod-12.southeastasia.logic.azure.com:443/workflows/...`
4. In the portal, go to **Teams alerts** → **Teams channels** → paste it in,
   name it, and say which department it is for.
5. Click **Send a test**. A card should appear in the channel within seconds.

The older **Incoming Webhook** connector (`...webhook.office.com`) works too, and
Microsoft is retiring it, which is why the Workflows route is the one written
out above.

### About that URL

Anyone holding it can post into your channel as the portal, forever. So:

- it is stored encrypted with `AUTH_SECRET`, the same as phone numbers;
- it is never rendered back to a browser, only its host and last four characters;
- only T3 Admin and above can add, edit or remove one;
- the portal will only POST to `webhook.office.com` and `logic.azure.com`. A URL
  pointing anywhere else is refused, which is what stops a pasted-in mistake
  turning the server into a request-forwarder.

If your tenant is on a sovereign cloud, add its host to `TEAMS_WEBHOOK_HOSTS` as
a comma-separated list. That setting adds to the allowlist; it cannot replace it.

---

## 2. The dispatcher (required, or nothing sends)

Messages are queued, not sent inline. Something has to call the dispatcher on a
schedule or the queue just grows.

Generate a secret and set it on the service:

```bash
openssl rand -base64 32
```

```
TEAMS_DISPATCH_SECRET=the-value-you-just-generated
```

Then point a scheduler at it, every 15 minutes is a sensible starting cadence:

```
POST https://your-portal.onrender.com/api/teams/dispatch
Authorization: Bearer <TEAMS_DISPATCH_SECRET>
```

A `GET` does the same thing, and the secret can travel as `?key=...` instead of
a header, because several free schedulers can do nothing else. Prefer the
header: URLs end up in logs.

Options for the scheduler, cheapest first:

- **GitHub Actions** on a `schedule:` trigger, with the secret in repository
  secrets. Free.
- **cron-job.org** or similar. Free, and the `?key=` form is what it will need.
- **Render Cron Job**. Cleanest, needs a paid plan.

The response says what it did:

```json
{ "status": "ok", "queuedFromScans": 3, "claimed": 3, "sent": 3, "failed": 0, "retrying": 0, "more": false }
```

`more: true` means the batch filled up and there is more waiting. Call it again.

---

## 3. Personal notifications (optional)

This is the half that can ping one person rather than a room. It needs a tenant
admin, because Microsoft requires one.

Ask them for an app registration with:

- the **`TeamsActivity.Send`** application permission, admin-consented
- a client secret
- the Teams app id the notification will appear to come from

Then set four values on the service:

```
MS_TENANT_ID=...
MS_CLIENT_ID=...
MS_CLIENT_SECRET=...
MS_TEAMS_APP_ID=...
```

With all four present, the "Also notify each person privately" switches become
available and the composer can send to named people. With any of them missing
the portal says so plainly instead of queueing messages that can only fail.

Each person also has to be linked: **Teams alerts** → **People and Teams** →
pick the person, type their Microsoft sign-in address. Usually their school
address. Somebody with no link is never mentioned and never pinged, rather than
guessed at.

---

## Who can do what

| | Member | Head | Admin |
|---|---|---|---|
| Send to own department | no | yes | yes |
| Send to all staff | no | no | yes |
| Send privately to a person | no | own department | anyone |
| Turn automatic rules on | no | own department | portal-wide |
| Add or remove a webhook URL | no | no | yes |
| Read the delivery log | no | own department | everything |

A head running one team can chase their own people and cannot reach anybody
else's, and cannot see or change the URL their messages travel down. Advisors
and alumni send nothing at all.

---

## Automatic rules

Each rule is one switch per department, with a portal-wide default underneath it.

| Rule | What it does |
|---|---|
| New announcement | Posts it to the channel as it goes up |
| A task is assigned | Tells the channel and mentions the assignees |
| A task is due soon | One reminder a day inside the warning window |
| A task is overdue | One reminder a day until it is done, approved, or two weeks past due |
| Run sheet item starting | Event days only, portal-wide |

"One reminder a day" is enforced by the queue rather than trusted to the
schedule: the key a reminder is filed under includes the Bangkok date, so the
dispatcher can run every five minutes without anybody's phone noticing.

---

## When it goes wrong

Everything is on the `/notifications` page, at the bottom.

| What you see | What it means |
|---|---|
| "No Teams channel is connected" | Add a webhook under Teams channels |
| Queued, never sending | `TEAMS_DISPATCH_SECRET` is missing, or nothing is calling the dispatcher |
| `Teams answered 404` | The webhook was deleted in Teams. Make a new one |
| `Teams answered 400` | Usually a Workflows flow expecting a different body |
| "could not be read. Re-add the channel" | `AUTH_SECRET` was rotated. Paste the URL again |
| "no Teams account linked" | Link them under People and Teams |
| "needs Microsoft Graph" | The four `MS_*` values are not all set |

A failed message keeps its error and a **Try again** button. Nothing is retried
forever: four attempts, backing off 1, 5 then 20 minutes, and a permanent error
like a 404 stops after the first.
