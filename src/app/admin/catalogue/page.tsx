import { redirect } from "next/navigation";

/** Shorthand for the admin bench: `/admin/catalogue`. */
export default function CataloguePage() {
  redirect("/admin?tab=catalogue");
}
