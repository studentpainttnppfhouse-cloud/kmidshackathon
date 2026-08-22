"use client";

import Link from "next/link";
import { AuthShell } from "@/components/brand";

/**
 * The last stop for a server error, so a database that is not ready shows a
 * page somebody can act on instead of an unstyled crash. Next.js scrubs the
 * message in production — the digest is what matches this up with the line in
 * the Render log, and /api/health says whether the schema is the problem.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AuthShell
      title="Something went wrong"
      subtitle="The portal could not finish loading that page"
      footer={
        <>
          Still broken? Open <code>/api/health</code> — if it reports{" "}
          <code>schema: &quot;missing&quot;</code>, the database has no tables yet and a
          redeploy will create them.
          {error.digest ? (
            <>
              <br />
              Reference: <code>{error.digest}</code>
            </>
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        <button type="button" onClick={reset} className="hs-btn hs-btn-primary w-full">
          Try again
        </button>
        <Link href="/login" className="hs-btn w-full">
          Back to sign-in
        </Link>
      </div>
    </AuthShell>
  );
}
