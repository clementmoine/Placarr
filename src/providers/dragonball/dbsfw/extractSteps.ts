/**
 * Fusion World catalogue Sync step selection (no Unity / Prisma imports).
 */
import { selectCatalogueSteps } from "@/providers/shared/cardCatalogue/catalogueSteps";

export const DBS_FW_EXTRACT_STEPS = [
  "scrape",
  "dbscards",
  "products",
  "faces",
  "details",
  /** CDN client dump — shaders / plates / masks / art.client (Lorcana `mobile`). */
  "foil",
  "documents",
] as const;

export type DbsFwExtractStep = (typeof DBS_FW_EXTRACT_STEPS)[number];

/** Steps that need the network (foil hits GUS + Xsolla CDN). */
const ONLINE = new Set<DbsFwExtractStep>([
  "scrape",
  "dbscards",
  "faces",
  "details",
  "foil",
  "documents",
]);

export function selectDbsFwSteps(argv: readonly string[]): DbsFwExtractStep[] {
  return selectCatalogueSteps(argv, DBS_FW_EXTRACT_STEPS, { online: ONLINE });
}
