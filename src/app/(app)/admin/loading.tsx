import { PageSkeleton } from "@/components/loading";

export default function Loading() {
  return <PageSkeleton label="Loading administration" stats cards={2} rows={5} />;
}
