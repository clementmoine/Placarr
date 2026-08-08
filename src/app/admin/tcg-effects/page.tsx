import { redirect } from "next/navigation";

/** Shorthand for the admin bench: `/admin/tcg-effects`. */
export default function TcgEffectsPage() {
  redirect("/admin?tab=tcg-effects");
}
