import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer, isAdmin } from "@/lib/authorize";
import { AssignmentRow, type AssignmentSummary } from "@/components/assignment-row";
import { Avatar, Card, DocStatusPill, EmptyState, SectionTitle, TierPill } from "@/components/ui";
import { formatDateLong } from "@/lib/dates";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;

  const person = await db.user.findUnique({
    where: { id },
    include: { department: true },
  });

  if (!person || person.deletedAt) notFound();

  const [assignments, documents] = await Promise.all([
    db.assignment.findMany({
      where: { deletedAt: null, assignees: { some: { userId: person.id } } },
      include: {
        department: { select: { name: true, color: true, slug: true } },
        assignees: {
          select: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } },
        },
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 25,
    }),
    db.document.findMany({
      where: { deletedAt: null, ownerId: person.id },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  // Contact details are staff-facing, but only the person themselves and
  // admins see the phone number and LINE ID.
  const showContact = isAdmin(viewer) || viewer.id === person.id;

  return (
    <div className="space-y-5">
      <Link href="/people" className="text-sm font-semibold text-pink-600">
        ← Directory
      </Link>

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={person.name} nickname={person.nickname} url={person.avatarUrl} size={72} />
          <div className="min-w-0">
            <h1 className="hs-h1">{person.nickname || person.name}</h1>
            <p className="text-sm text-muted">
              {person.name}
              {person.roleTitle ? ` · ${person.roleTitle}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <TierPill tier={person.tier} />
              {person.department ? (
                <Link
                  href={`/departments/${person.department.slug}`}
                  className="hs-pill text-white"
                  style={{ background: person.department.color }}
                >
                  {person.department.name}
                </Link>
              ) : null}
              {person.isReserve ? <span className="hs-pill bg-amber-50 text-amber-700">Reserve</span> : null}
              {person.isMentor ? <span className="hs-pill bg-teal-50 text-teal-700">Mentor</span> : null}
              {person.isAlumni ? <span className="hs-pill bg-slate-100 text-slate-600">Alumni</span> : null}
              {!person.isActive ? <span className="hs-pill bg-red-50 text-red-700">Suspended</span> : null}
            </div>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 border-t border-[#f6ecf2] pt-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="hs-eyebrow">Grade</dt>
            <dd className="mt-0.5 font-semibold text-ink">{person.grade ?? "—"}</dd>
          </div>
          <div>
            <dt className="hs-eyebrow">Shirt size</dt>
            <dd className="mt-0.5 font-semibold text-ink">{person.shirtSize ?? "—"}</dd>
          </div>
          {showContact ? (
            <>
              <div>
                <dt className="hs-eyebrow">Phone</dt>
                <dd className="mt-0.5 font-semibold text-ink">{person.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="hs-eyebrow">LINE</dt>
                <dd className="mt-0.5 font-semibold text-ink">{person.lineId ?? "—"}</dd>
              </div>
            </>
          ) : (
            <div className="sm:col-span-2">
              <dt className="hs-eyebrow">Contact</dt>
              <dd className="mt-0.5 text-faint">Visible to admins only</dd>
            </div>
          )}
        </dl>

        {isAdmin(viewer) ? (
          <p className="mt-4 text-xs text-faint">
            {person.email} · joined {formatDateLong(person.createdAt)} · last signed in{" "}
            {person.lastLoginAt ? formatDateLong(person.lastLoginAt) : "never"}
          </p>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Assignments</SectionTitle>
        {assignments.length === 0 ? (
          <EmptyState title="Nothing assigned right now" />
        ) : (
          <div className="-mx-1 space-y-0.5">
            {assignments.map((a) => (
              <AssignmentRow key={a.id} a={a as AssignmentSummary} />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Documents</SectionTitle>
        {documents.length === 0 ? (
          <EmptyState title="No documents owned" />
        ) : (
          <ul className="space-y-2">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3">
                <a
                  href={d.externalUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="truncate text-sm font-semibold text-ink hover:text-pink-700"
                >
                  {d.title} ↗
                </a>
                <DocStatusPill status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
