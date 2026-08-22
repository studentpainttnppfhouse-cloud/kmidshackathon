import { PageSkeleton } from "@/components/loading";

export default function Loading() {
  return <PageSkeleton label="Loading assignments" stats={false} cards={0} rows={7} />;
}
