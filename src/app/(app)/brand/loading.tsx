import { PageSkeleton } from "@/components/loading";

export default function Loading() {
  return <PageSkeleton label="Loading the brand kit" stats={false} cards={3} rows={0} />;
}
