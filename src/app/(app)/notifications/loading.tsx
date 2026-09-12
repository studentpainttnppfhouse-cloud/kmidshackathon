import { PageSkeleton } from "@/components/loading";

export default function Loading() {
  return <PageSkeleton label="Loading notifications" stats={false} cards={4} rows={0} />;
}
