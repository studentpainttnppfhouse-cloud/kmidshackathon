import { PageSkeleton } from "@/components/loading";

export default function Loading() {
  return <PageSkeleton label="Loading documents" stats={false} cards={3} rows={0} />;
}
