import { PageSkeleton } from "@/components/loading";

export default function Loading() {
  return <PageSkeleton label="Loading the directory" stats={false} cards={0} rows={8} />;
}
