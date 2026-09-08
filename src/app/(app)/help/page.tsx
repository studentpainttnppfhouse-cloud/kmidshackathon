import type { Metadata } from "next";
import Link from "next/link";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { requireViewer } from "@/lib/authorize";
import { TIER_BLURB, TIER_LABEL, MIN_PASSWORD_LENGTH, SESSION_TTL_DAYS } from "@/lib/constants";
import { Faq } from "@/components/chrome";
import { Card, LastUpdated, PageHeader, SectionTitle } from "@/components/ui";
import type { Tier } from "@prisma/client";

export const metadata: Metadata = { title: "Help" };
export const dynamic = "force-dynamic";

const TIERS: Tier[] = ["T0_ADVISOR", "T1_MEMBER", "T2_HEAD", "T3_ADMIN", "T4_OWNER"];

/**
 * The page that answers the questions people ask a head over LINE.
 *
 * "Last updated" is the file's own modification time rather than a hard-coded
 * string, because a hard-coded date on a help page is wrong within a month and
 * then quietly lies for a year.
 */
async function lastUpdated(): Promise<Date | null> {
  try {
    const here = join(process.cwd(), "src", "app", "(app)", "help", "page.tsx");
    return (await stat(here)).mtime;
  } catch {
    // A bundled deployment may not ship the source. Not knowing is fine;
    // guessing is not.
    return null;
  }
}

export default async function HelpPage() {
  await requireViewer();
  const updated = await lastUpdated();

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Help"
        title="How the portal works"
        subtitle="The things people ask a head over LINE, written down once."
      />

      <Card>
        <SectionTitle>Common questions</SectionTitle>
        <Faq
          items={[
            {
              q: "Do I have to sign in every time?",
              a: (
                <>
                  No. A sign-in lasts {SESSION_TTL_DAYS} days on that device and slides forward
                  every time you use it, so in practice you sign in once per phone and once per
                  laptop. Portal updates and redeploys do not sign you out — the session lives in
                  the database, not in a cookie signature. Sign out only on a shared computer.
                </>
              ),
            },
            {
              q: "I forgot my password.",
              a: (
                <>
                  There is no self-service reset, because the portal sends no email. Ask an admin:
                  they generate a one-time link from the admin panel and hand it to you directly.
                  The link works once, expires in two days, and signs out every other device on
                  your account when you use it.
                </>
              ),
            },
            {
              q: "Why is my account locked?",
              a: (
                <>
                  Five wrong passwords locks an account for fifteen minutes. It clears itself, or
                  an admin can unlock it immediately. Passwords need at least{" "}
                  {MIN_PASSWORD_LENGTH} characters — a phrase you will remember beats a short one
                  you will not.
                </>
              ),
            },
            {
              q: "Can I see other departments' work?",
              a: (
                <>
                  Yes, reading across departments is deliberate — the whole point of the portal is
                  one shared view. Writing is different: you edit inside your own department, and
                  approving or reassigning is your head's job. Two things are never open: the
                  incident log, which is admin-only, and other people's phone numbers and LINE IDs.
                </>
              ),
            },
            {
              q: "Where do documents actually live?",
              a: (
                <>
                  Either place, and you choose per document. Write it in the portal and it is
                  stored here, exports to Word, PDF or Markdown, and can be attached to a task as
                  the submission. Or paste a Google Docs link and the portal indexes it while the
                  content stays in Drive with its comments and history.
                </>
              ),
            },
            {
              q: "Can I upload a file?",
              a: (
                <>
                  Yes. Files go into the portal database, not onto the server&rsquo;s disk, so a
                  deploy does not touch them and every device you sign in on sees the same file.
                  Attach them to a task, a document or an announcement, or file them in{" "}
                  <Link href="/files/new">Files &amp; Assets</Link>. Picking a file uploads it
                  straight away — there is no second button to press. Anything over the size limit
                  the page shows stays in Drive or Canva, and the portal keeps the name and the
                  link so the task still says the file exists.
                </>
              ),
            },
            {
              q: "Who can attach a file to a task?",
              a: (
                <>
                  Whoever set the task and whoever it is set for, plus the head of that team and
                  the admins above them. Anyone who can read the task can open its files. It is the
                  same rule as editing the task, because attaching a file is a claim about it.
                </>
              ),
            },
            {
              q: "I closed the tab halfway through writing something.",
              a: (
                <>
                  Open the same form again. What you typed is kept in this browser as you go and
                  gets put back into an empty box, with a note saying so. It stays on this device
                  and is cleared once you send the thing — passwords and files are never kept this
                  way.
                </>
              ),
            },
            {
              q: "How do internal forms work?",
              a: (
                <>
                  A head builds one from <Link href="/forms/new">Forms → New form</Link>: short
                  answers, paragraphs, dropdowns, multiple choice, checkboxes, yes/no/maybe, dates,
                  numbers and 1–5 scales. Answers stay in the portal. Only the form's owner and
                  admins can read the response table; everybody else sees their own answers and can
                  change them until the form closes.
                </>
              ),
            },
            {
              q: "What happens when I delete something?",
              a: (
                <>
                  Nothing is really gone. Tasks, documents, assets and announcements are
                  soft-deleted into a recycle bin that an admin can restore from. Form responses
                  are the exception — removing one deletes it.
                </>
              ),
            },
            {
              q: "Is it usable on a phone?",
              a: (
                <>
                  That is the main way it gets used. Every page is responsive, buttons are sized
                  for thumbs, and the portal follows your phone's light or dark setting unless you
                  pick one yourself from the sidebar.
                </>
              ),
            },
            {
              q: "What data does the portal keep about me?",
              a: (
                <>
                  Name, nickname, grade, role, shirt size, and optionally a phone number and LINE
                  ID. The last two are encrypted before they are stored and are shown only to you
                  and to admins. There is no analytics, no tracking, and one cookie — the sign-in.
                  Nothing is shared with anyone outside the school.
                </>
              ),
            },
          ]}
        />
      </Card>

      <Card>
        <SectionTitle>What each tier can do</SectionTitle>
        <ul className="space-y-2.5">
          {TIERS.map((tier) => (
            <li key={tier} className="rounded-xl border border-line p-3">
              <p className="text-sm font-bold text-ink">{TIER_LABEL[tier]}</p>
              <p className="mt-0.5 text-sm text-muted">{TIER_BLURB[tier]}</p>
            </li>
          ))}
        </ul>
      </Card>

      <LastUpdated at={updated} label="This page last changed" />
    </div>
  );
}
