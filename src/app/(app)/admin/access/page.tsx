import type { Metadata } from "next";
import Link from "next/link";
import { requireTier } from "@/lib/authorize";
import { pageMatrix } from "@/lib/page-access";
import { AccessGrid } from "@/components/access-grid";
import { Banner, Card, PageHeader, SectionTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Page access" };
export const dynamic = "force-dynamic";

/**
 * The whole portal, page by tier, on one screen.
 *
 * Owner only. The grid decides who can reach the accounts screen and the audit
 * log, so an admin able to edit it could hand themselves the two things T3 is
 * deliberately short of, and the gap between T3 and T4 would stop meaning
 * anything.
 */
export default async function PageAccessPage() {
  await requireTier("T4_OWNER");
  const matrix = await pageMatrix();

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Who can see what"
        subtitle="One row per page, one column per tier. Changes save as you click and take effect on the next page load, for everybody."
        action={
          <Link href="/admin" className="hs-btn hs-btn-ghost">
            Back to admin
          </Link>
        }
      />

      <Banner tone="info">
        This grid can only take access away, never add it. A tier set to Full still does only what
        its role allows: members with Full on Announcements still cannot broadcast, because that was
        never theirs to begin with.
      </Banner>

      <Card>
        <SectionTitle>Pages &amp; tiers</SectionTitle>
        <AccessGrid matrix={matrix} />
      </Card>
    </div>
  );
}
