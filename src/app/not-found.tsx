import Link from "next/link";
import { AuthShell } from "@/components/brand";

export default function NotFound() {
  return (
    <AuthShell title="Page not found" subtitle="That link does not lead anywhere">
      <Link href="/dashboard" className="hs-btn hs-btn-primary w-full">
        Back to the dashboard
      </Link>
    </AuthShell>
  );
}
