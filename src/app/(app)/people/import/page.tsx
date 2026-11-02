import { redirect } from "next/navigation";

/** Import was retired; adding someone now happens from the People page. */
export default function ImportRedirect() {
  redirect("/people?add=1");
}
