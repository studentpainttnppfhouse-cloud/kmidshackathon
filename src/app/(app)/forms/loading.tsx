import { PageSkeleton } from "@/components/loading";

export default function Loading() {
  return <PageSkeleton label="Loading forms" stats={false} cards={2} rows={4} />;
}
