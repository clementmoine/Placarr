/**
 * Postgres accent-folded item id lookup (`placarr_fold` / unaccent).
 *
 * Kept off {@link buildItemSearchConditions} so client modules that import
 * search helpers never pull Prisma.
 */
import "server-only";

import { normalizeForTokens } from "@/core/enrich/titles/normalize";
import { stripVolumeMarkersKeepingNumber } from "@/core/enrich/titles/volumeNumber";
import { buildItemSearchConditions } from "@/core/collect/search";
import type { Prisma as PrismaBrowser } from "@/generated/prisma/browser";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

const MIN_AND_TOKEN_LENGTH = 2;

function foldedTokens(searchTerm: string): string[] {
  return Array.from(
    new Set(
      stripVolumeMarkersKeepingNumber(searchTerm)
        .trim()
        .split(/\s+/)
        .map((token) => normalizeForTokens(token))
        .filter(
          (token) =>
            token.length >= MIN_AND_TOKEN_LENGTH || /^\d+$/.test(token),
        ),
    ),
  );
}

function foldedHaystackLike(token: string): Prisma.Sql {
  return Prisma.sql`placarr_fold(
    coalesce(i.name, '') || ' ' ||
    coalesce(i.description, '') || ' ' ||
    coalesce(i."printKey", '') || ' ' ||
    coalesce(i.slug, '') || ' ' ||
    coalesce(m.title, '') || ' ' ||
    coalesce(m."sourceQuery", '') || ' ' ||
    coalesce(m.aliases::text, '')
  ) LIKE ${`%${token}%`}`;
}

/**
 * Item ids whose name / title / aliases fold-match the query
 * (« epees » → « Épées »). Empty when the extension is missing or nothing hits.
 */
export async function itemIdsMatchingFoldedText(
  searchTerm: string,
): Promise<string[]> {
  const trimmed = searchTerm.trim();
  if (!trimmed) return [];

  const tokens = foldedTokens(trimmed);
  const phrase = normalizeForTokens(trimmed);
  const needles = tokens.length > 0 ? tokens : phrase ? [phrase] : [];
  if (needles.length === 0) return [];

  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT i.id
      FROM "Item" i
      LEFT JOIN "Metadata" m ON m.id = i."metadataId"
      WHERE ${Prisma.join(
        needles.map((token) => foldedHaystackLike(token)),
        " AND ",
      )}
    `;
    return rows.map((row) => row.id);
  } catch (error) {
    console.warn(
      "[searchFolded] placarr_fold unavailable — accent-insensitive SQL skipped",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/** Prisma `OR` list: classic contains + folded-text id hits. */
export async function buildItemSearchConditionsFolded(
  searchTerm: string,
): Promise<PrismaBrowser.ItemWhereInput[]> {
  const conditions = buildItemSearchConditions(searchTerm);
  const foldedIds = await itemIdsMatchingFoldedText(searchTerm);
  if (foldedIds.length > 0) {
    conditions.push({ id: { in: foldedIds } });
  }
  return conditions;
}
