import { redirect } from "next/navigation";

/** Legacy URL — the bench lives under `/admin?tab=tcg-effects`. */
export default function FoilPlayroomPage() {
  redirect("/admin?tab=tcg-effects");
}
