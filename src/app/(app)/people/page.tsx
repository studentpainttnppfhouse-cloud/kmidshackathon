import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { Avatar, Card, Divider, EmptyState, PageHeader, SectionTitle, TierPill } from "@/components/ui";

export const metadata: Metadata = { title: "People" };
export const dynamic = "force-dynamic";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string }>;
}) {
  const viewer = await requireViewer();
  const { q, dept } = await searchParams;
  const canImport = can(viewer, "manage_users", { kind: "user", userId: viewer.id });

  const [departments, people] = await Promise.all([
    db.department.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        head: { select: { id: true, name: true, nickname: true, avatarUrl: true, roleTitle: true } },
        members: {
          where: { deletedAt: null },
          select: { id: true, name: true, nickname: true, avatarUrl: true, roleTitle: true, tier: true },
          orderBy: { name: "asc" },
        },
      },
    }),
    db.user.findMany({
      where: {
        deletedAt: null,
        ...(dept ? { department: { slug: dept } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { nickname: { contains: q } },
                { roleTitle: { contains: q } },
              ],
            }
          : {}),
      },
      include: { department: { select: { name: true, color: true, slug: true } } },
      orderBy: [{ tier: "desc" }, { name: "asc" }],
    }),
  ]);

  return (
    <div className="hs-enter space-y-6">
      <PageHeader
        eyebrow="People"
        title="Directory & org chart"
        subtitle="Who is on the team, which department they are in, and who leads it."
        action={
          canImport ? (
            <Link href="/people/import" className="hs-btn hs-btn-primary">
              <span aria-hidden="true">＋</span> Import people
            </Link>
          ) : null
        }
      />

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          type="search"
          placeholder="Search a name or role…"
          className="hs-input max-w-xs"
          aria-label="Search people"
        />
        <select name="dept" defaultValue={dept ?? ""} className="hs-input max-w-[220px]">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.slug}>
              {d.name}
            </option>
          ))}
        </select>
        <button type="submit" className="hs-btn hs-btn-secondary">
          Search
        </button>
      </form>

      {people.length === 0 ? (
        <EmptyState title="Nobody matches that" hint="Try a different name or clear the filter." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <Link
              key={p.id}
              href={`/people/${p.id}`}
              className="hs-card flex items-center gap-3 p-4"
            >
              <Avatar name={p.name} nickname={p.nickname} url={p.avatarUrl} size={44} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-ink">
                  {p.nickname || p.name}
                </span>
                <span className="block truncate text-xs text-muted">
                  {p.roleTitle ?? "Staff"}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  <TierPill tier={p.tier} />
                  {p.department ? (
                    <span
                      className="hs-pill text-white"
                      style={{ background: p.department.color }}
                    >
                      {p.department.name}
                    </span>
                  ) : null}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <Divider />

      <Card>
        <SectionTitle>Org chart</SectionTitle>
        <div className="space-y-4">
          {departments.map((d) => (
            <div key={d.id} className="rounded-xl border border-[#f3e3ec] p-4">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: d.color }}
                  aria-hidden="true"
                />
                <Link href={`/departments/${d.slug}`} className="font-bold text-ink hover:text-pink-700">
                  {d.name}
                </Link>
                <span className="text-xs text-faint">{d.members.length} people</span>
              </div>

              {d.head ? (
                <Link
                  href={`/people/${d.head.id}`}
                  className="mb-3 flex items-center gap-2 rounded-lg bg-pink-50 px-3 py-2"
                >
                  <Avatar
                    name={d.head.name}
                    nickname={d.head.nickname}
                    url={d.head.avatarUrl}
                    size={30}
                  />
                  <span className="text-sm">
                    <span className="font-semibold text-pink-700">
                      {d.head.nickname || d.head.name}
                    </span>
                    <span className="ml-1.5 text-xs text-muted">Head</span>
                  </span>
                </Link>
              ) : (
                <p className="mb-3 text-xs text-faint">No head assigned yet.</p>
              )}

              <div className="flex flex-wrap gap-1.5">
                {d.members
                  .filter((m) => m.id !== d.head?.id)
                  .map((m) => (
                    <Link
                      key={m.id}
                      href={`/people/${m.id}`}
                      className="flex items-center gap-1.5 rounded-full border border-[#f3e3ec] py-0.5 pl-0.5 pr-2.5 text-xs font-medium text-muted hover:border-pink-300 hover:text-pink-700"
                    >
                      <Avatar name={m.name} nickname={m.nickname} url={m.avatarUrl} size={22} />
                      {m.nickname || m.name}
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
