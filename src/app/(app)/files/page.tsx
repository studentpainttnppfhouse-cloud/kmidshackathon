import { redirect } from "next/navigation";

// Files & assets now live inside the Brand kit. Old links (search results,
// bookmarks, post-upload redirects) keep their filters.
export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["q", "dept", "tag"]) {
    const v = sp[key];
    if (typeof v === "string" && v) params.set(key, v);
  }
  const qs = params.toString();
  redirect(qs ? `/brand?${qs}#assets` : "/brand#assets");
}
