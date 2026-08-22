import { PageSkeleton } from "@/components/loading";

export default function Loading() {
  return <PageSkeleton label="Loading your dashboard" stats cards={2} rows={3} />;
}
