import { redirect } from "next/navigation";

/** Legacy URL — the bench is now `/admin?tab=catalogue`. */
export default function LegacyTcgEffectsPage() {
  redirect("/admin?tab=catalogue");
}
