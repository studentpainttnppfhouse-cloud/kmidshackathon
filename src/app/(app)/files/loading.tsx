import { PageSkeleton } from "@/components/loading";

export default function Loading() {
  return <PageSkeleton label="Loading assets" stats={false} cards={3} rows={0} />;
}
