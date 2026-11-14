/**
 * Resolve pack / set sleeve role URLs onto disk bytes.
 * Public: `/assets/<pack>/backs/{lang}` and `…/backs/{lang}/sets/{set}`.
 */
import {
  resolvePackBackPath,
  resolvePackTierBackPath,
  resolveSetBackPath,
} from "@/lib/packPaths";

export type RoleBackHit = {
  filePath: string;
  kind: "pack" | "set" | "tier";
  lang: string;
  set?: string;
  tier?: string;
};

/**
 * `rest` after pack split: `backs / {lang}` or `backs / {lang} / sets / {set}`
 * or `backs / {lang} / tiers / {tier}`.
 */
export function matchAssetsBacksRest(rest: readonly string[]): {
  lang: string;
  set?: string;
  tier?: string;
} | null {
  if (rest.length < 2 || rest[0] !== "backs") return null;
  const lang = decodeURIComponent(rest[1] ?? "").trim().toLowerCase();
  if (!lang || !/^[a-z]{2}([a-z]{2})?$/.test(lang)) return null;
  if (rest.length === 2) return { lang };
  if (rest.length === 4 && rest[2] === "sets") {
    const set = decodeURIComponent(rest[3] ?? "").trim().toLowerCase();
    if (!set || set.includes("..") || set.includes("/")) return null;
    return { lang, set };
  }
  if (rest.length === 4 && rest[2] === "tiers") {
    const tier = decodeURIComponent(rest[3] ?? "").trim().toLowerCase();
    if (!tier || !/^[a-z0-9][a-z0-9-]*$/.test(tier)) return null;
    return { lang, tier };
  }
  return null;
}

export function resolveRoleBack(
  pack: string,
  matched: { lang: string; set?: string; tier?: string },
): RoleBackHit | null {
  if (matched.tier) {
    const filePath = resolvePackTierBackPath(pack, matched.tier);
    if (!filePath) return null;
    return {
      filePath,
      kind: "tier",
      lang: matched.lang,
      tier: matched.tier,
    };
  }
  if (matched.set) {
    const filePath = resolveSetBackPath(pack, matched.set, matched.lang);
    if (!filePath) return null;
    return {
      filePath,
      kind: "set",
      lang: matched.lang,
      set: matched.set,
    };
  }
  const filePath = resolvePackBackPath(pack, matched.lang);
  if (!filePath) return null;
  return { filePath, kind: "pack", lang: matched.lang };
}
