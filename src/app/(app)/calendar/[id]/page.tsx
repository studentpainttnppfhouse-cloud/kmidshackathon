import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/authorize";
import { db } from "@/lib/db";
import { EntryForm } from "@/components/workspace-forms";
import { PageHeader } from "@/components/ui";
import {
  canReadEntry,
  canEditEntry,
  canAssignPerson,
  ids,
  bangkokDay,
} from "@/lib/workspace-policy";
import { TIER_ORDER } from "@/lib/constants";
import { removeEntry } from "@/lib/actions/workspace";
export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const v = await requirePageAccess("calendar");
  const { id } = await params;
  const e = await db.calendarEntry.findUnique({ where: { id } });
  if (!e || !canReadEntry(v, e)) notFound();
  const edit = canEditEntry(v, e);
  const [people, departments] = await Promise.all([
    db.user.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
    }),
    db.department.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const stamp = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  const input = (d: Date) =>
    bangkokDay(d) +
    "T" +
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(d);
  return (
    <div className="space-y-4">
      <Link
        className="hs-btn hs-btn-secondary"
        href={e.kind === "meeting" ? "/meetings" : "/calendar"}
      >
        ← {e.kind === "meeting" ? "Meetings" : "Calendar"}
      </Link>
      <PageHeader
        eyebrow="Workspace"
        title={e.title}
        subtitle={`${stamp(e.startsAt)}${e.endsAt ? " – " + stamp(e.endsAt) : ""} · Bangkok`}
      />
      <article className="hs-card space-y-3 p-5">
        <p>{e.location}</p>
        <p className="whitespace-pre-wrap">{e.body}</p>
        <p className="text-sm text-muted">
          {e.scope === "private" ? "Personal" : e.scope} ·{" "}
          {people
            .filter((p) => ids(e.attendeeIds).includes(p.id))
            .map((p) => p.nickname || p.name)
            .join(", ")}
        </p>
      </article>
      {edit ? (
        <details className="space-y-3">
          <summary className="hs-btn hs-btn-secondary">Edit event</summary>
          <EntryForm
            entry={{
              ...e,
              date: bangkokDay(e.startsAt),
              time: input(e.startsAt).slice(11),
              end: e.endsAt ? input(e.endsAt) : "",
              attendeeIds: ids(e.attendeeIds),
            }}
            level={TIER_ORDER[v.tier]}
            ownDepartment={v.departmentId}
            people={people
              .filter((p) => canAssignPerson(v, p))
              .map((p) => ({ id: p.id, name: p.nickname || p.name }))}
            departments={departments.filter(
              (d) => TIER_ORDER[v.tier] >= 3 || d.id === v.departmentId,
            )}
          />
          <form
            action={async () => {
              "use server";
              await removeEntry(id);
            }}
          >
            <button className="hs-btn hs-btn-secondary">Remove event</button>
          </form>
        </details>
      ) : (
        <p className="text-sm text-muted">
          Read only. Heads, admins and owners manage shared events.
        </p>
      )}
    </div>
  );
}
