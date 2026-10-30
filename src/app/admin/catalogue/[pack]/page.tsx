import { redirect } from "next/navigation";

/** Shorthand for one pack's bench: `/admin/catalogue/pokemon`. */
export default async function CataloguePackPage({
  params,
}: {
  params: Promise<{ pack: string }>;
}) {
  const { pack } = await params;
  redirect(`/admin?tab=catalogue&pack=${encodeURIComponent(pack)}`);
}
