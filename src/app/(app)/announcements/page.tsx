import { redirect } from "next/navigation";

// The "Updates" page was removed from the portal. Announcements still show on
// the dashboard, so old links and bookmarks land there.
export default function AnnouncementsPage() {
  redirect("/dashboard");
}
