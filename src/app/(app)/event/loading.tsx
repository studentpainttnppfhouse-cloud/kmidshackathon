import { PageSkeleton } from "@/components/loading";

export default function Loading() {
  return <PageSkeleton label="Loading event day" stats cards={2} rows={4} />;
}
