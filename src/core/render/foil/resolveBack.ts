import { getEffectPack } from "./registry";

export function resolveCardBackUrl(opts: {
  shelfCardBackUrl?: string | null;
  effectPackId?: string | null;
}): string | null {
  if (opts.shelfCardBackUrl) return opts.shelfCardBackUrl;

  const pack = getEffectPack(opts.effectPackId);
  return pack?.cardBackUrl ?? null;
}
