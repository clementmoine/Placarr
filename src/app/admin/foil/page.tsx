import { redirect } from "next/navigation";

/** Legacy URL — the bench lives under "/admin?tab=catalogue". */
export default function FoilPlayroomPage() {
  redirect("/admin?tab=catalogue");
}
