import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageAccess, can } from "@/lib/authorize";
import { PeopleImport } from "@/components/people-import";
import { Card, PageHeader, SectionTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Import people" };
export const dynamic = "force-dynamic";

export default async function ImportPeoplePage() {
  // A composer, not a page: a tier held at Read on people never reaches it.
  const viewer = await requirePageAccess("people", "edit");

  // The page checks the same permission the action does. Reaching it by URL is
  // not a way around the button not being there.
  if (!can(viewer, "manage_users", { kind: "user", userId: viewer.id })) {
    return (
      <div className="hs-enter space-y-4">
        <PageHeader eyebrow="People" title="Importing is an owner's job" />
        <p className="text-sm text-muted">
          Adding people to the portal creates invites, which is a T4 action. Ask an owner.
        </p>
        <Link href="/people" className="hs-btn hs-btn-secondary">
          Back to the directory
        </Link>
      </div>
    );
  }

  const departments = await db.department.findMany({
    orderBy: { sortOrder: "asc" },
    select: { slug: true },
  });

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="People"
        title="Import the team"
        subtitle="Paste a list from a spreadsheet and the portal creates one invite per person."
        action={
          <Link href="/people" className="hs-btn hs-btn-ghost">
            Cancel
          </Link>
        }
      />
      <Card>
        <SectionTitle>Rows</SectionTitle>
        <PeopleImport departmentSlugs={departments.map((d) => d.slug)} />
      </Card>
    </div>
  );
}
