import { PageSkeleton } from "@/components/loading";

export default function Loading() {
  return <PageSkeleton label="Loading your account" stats={false} cards={2} rows={2} />;
}
