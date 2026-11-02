import type { Metadata } from "next";
import Link from "next/link";
import { requireTier } from "@/lib/authorize";
import { pageMatrix } from "@/lib/page-access";
import { AccessGrid } from "@/components/access-grid";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Page access" };
export const dynamic = "force-dynamic";

/** The page-by-tier grid. Admins and the owner may edit it. */
export default async function PageAccessPage() {
  await requireTier("T3_ADMIN");
  const matrix = await pageMatrix();

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Page access"
        action={
          <Link href="/admin" className="hs-btn hs-btn-ghost">
            Back to admin
          </Link>
        }
      />
      <Card>
        <AccessGrid matrix={matrix} />
      </Card>
    </div>
  );
}
