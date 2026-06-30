/**
 * 3D vs 2D cover roles
 *
 * **Storage policy:** roles are never inferred from raster geometry — pixel
 * heuristics proved too brittle on real marketplace/retailer images (a tightly
 * cropped, front-on seller photo is geometrically indistinguishable from a flat
 * catalogue render), so the perspective/3D pixel detectors were removed. A cover
 * is tagged `3d-*` only when:
 *
 * 1. The provider declares it (ScreenScraper `box-3D` → `3d-${region}`).
 * 2. The URL/title carries an explicit `box-3d` / `cart-3d` hint.
 *
 * Past raster-inferred `3d-*` tags on eBay, PriceCharting, ChocoBonPlan, etc.
 * are demoted back to their plain region on re-enrich.
 */
import { resolveLocaleRegion } from "@/lib/locale/preference";

function normalizeHint(value?: string | null): string {
  return (value || "").toLowerCase();
}

function hasExplicit3dCoverHint(
  url?: string | null,
  title?: string | null,
): boolean {
  const hint = `${url || ""} ${title || ""}`.toLowerCase();
  return (
    hint.includes("box-3d") ||
    hint.includes("box_3d") ||
    hint.includes("cart-3d")
  );
}

function demoteInferred3dCoverRole(role?: string | null): string | null {
  if (!role || !coverRoleIndicates3d(role)) return role ?? null;
  const stripped = normalizeHint(role).replace(/^3d-/, "");
  return regionTokenFromPlainRole(stripped) || stripped || role;
}

/** Provider metadata we trust for `3d-*` without re-analysing pixels. */
function isProviderAuthoritative3dCoverRole(input: {
  role?: string | null;
  source?: string | null;
  url?: string | null;
  title?: string | null;
  authoritative3dCoverRoleSource?: boolean;
}): boolean {
  if (!coverRoleIndicates3d(input.role)) return false;
  if (hasExplicit3dCoverHint(input.url, input.title)) return true;
  return input.authoritative3dCoverRoleSource === true;
}

export function coverRoleIndicates3d(role?: string | null): boolean {
  const normalized = normalizeHint(role);
  if (!normalized) return false;
  return (
    normalized.startsWith("3d-") ||
    normalized.endsWith("-3d") ||
    normalized === "3d"
  );
}

/** Retailer / provider filenames that are flat scans, not 3D mockups. */
export function coverSourceHintsIndicate2d(
  url?: string | null,
  title?: string | null,
): boolean {
  const hint = `${url || ""} ${title || ""}`.toLowerCase();
  if (!hint.trim()) return false;
  return (
    hint.includes("bon-plan") ||
    hint.includes("bon plan") ||
    hint.includes("pas-cher") ||
    hint.includes("visuel-produit") ||
    hint.includes("visuel produit") ||
    /-produit\.(png|jpe?g|webp)/.test(hint) ||
    hint.includes("box-2d") ||
    hint.includes("box_2d") ||
    hint.includes("cart-2d")
  );
}

function regionTokenFromPlainRole(role?: string | null): string {
  const normalized = normalizeHint(role);
  if (!normalized) return "wor";
  const region = resolveLocaleRegion(normalized);
  return region || normalized;
}

/** Explicit provider/filename hints for 3D packshots (not inferred from pixels). */
export function inferCover3dRoleFromHints(input: {
  url?: string | null;
  title?: string | null;
  role?: string | null;
  source?: string | null;
  coverDefaultRegion?: string | null;
}): string | null {
  if (coverRoleIndicates3d(input.role)) return null;
  if (coverSourceHintsIndicate2d(input.url, input.title)) return null;

  const hint = `${input.url || ""} ${input.title || ""}`.toLowerCase();
  if (!hint.trim()) return null;

  const is3dHint =
    hint.includes("box-3d") ||
    hint.includes("box_3d") ||
    hint.includes("cart-3d");

  if (!is3dHint) return null;

  const region = input.coverDefaultRegion || regionTokenFromPlainRole(input.role);
  return `3d-${region}`;
}

/**
 * Resolve a cover's persisted role from declarative hints only (provider trait,
 * URL/title token). Never inspects pixels: see the module header.
 */
export function resolveCoverAttachmentRole(input: {
  type: string;
  url?: string | null;
  title?: string | null;
  role?: string | null;
  source?: string | null;
  authoritative3dCoverRoleSource?: boolean;
  gridStyleCoverLabelsSource?: boolean;
}): string | null | undefined {
  if (input.type !== "cover") return input.role;

  const normalizedRole = normalizeHint(input.role);
  if (
    input.gridStyleCoverLabelsSource &&
    (normalizedRole === "grid-vertical" ||
      normalizedRole === "grid-horizontal" ||
      normalizedRole === "3d-grid-vertical" ||
      normalizedRole === "3d-grid-horizontal")
  ) {
    return input.role;
  }

  if (coverSourceHintsIndicate2d(input.url, input.title)) {
    if (coverRoleIndicates3d(input.role)) {
      return demoteInferred3dCoverRole(input.role);
    }
    return input.role;
  }

  const hinted = inferCover3dRoleFromHints(input);
  if (hinted) return hinted;

  if (isProviderAuthoritative3dCoverRole(input)) {
    return input.role;
  }

  if (coverRoleIndicates3d(input.role)) {
    return demoteInferred3dCoverRole(input.role);
  }

  return input.role;
}
