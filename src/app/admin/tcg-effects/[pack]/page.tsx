import { redirect } from "next/navigation";

/**
 * Shorthand for one pack's bench: `/admin/tcg-effects/pokemon`.
 *
 * The segment is carried through as-is; the playroom matches it against the
 * registered pack ids, so a new pack needs no route of its own.
 */
export default async function TcgEffectsPackPage({
  params,
}: {
  params: Promise<{ pack: string }>;
}) {
  const { pack } = await params;
  redirect(`/admin?tab=tcg-effects&pack=${encodeURIComponent(pack)}`);
}
