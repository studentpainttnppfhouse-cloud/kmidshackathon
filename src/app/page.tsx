import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";

export default async function Root() {
  const viewer = await getViewer();
  redirect(viewer ? "/dashboard" : "/login");
}
