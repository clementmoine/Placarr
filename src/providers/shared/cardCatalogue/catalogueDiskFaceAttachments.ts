/**
 * Affiche gallery from on-disk `art.*` dumps under a pack card folder.
 * Lang-first layout via {@link packCardDir} — shared by LocalTcgLine + DBS.
 */
import { existsSync, readdirSync } from "node:fs";

import { resolveDiskFaceAttachmentMeta } from "@/core/enrich/media/faceArtMeta";
import { assetsCardUrl, type CardDiskId } from "@/lib/packAssetUrls";
import { packCardDir } from "@/lib/packPaths";
import type { MetadataAttachment } from "@/types/metadataProvider";

import { tcgFaceAttachmentRole } from "./tcgFaceRole";

export type CatalogueDiskFaceAttachmentsInput = {
  packId: string;
  diskId: CardDiskId;
  /**
   * Basename shown first in the Affiche gallery (ranked dump / indexed art).
   * Must appear in {@link artFiles} / folder listing to win order.
   */
  preferredArt?: string | null;
  /**
   * Basename that receives `print_assets` artKind / watermark stamps.
   * Defaults to {@link preferredArt} (or the ordered default).
   */
  indexedWinnerArt?: string | null;
  providerId: string;
  printGame: string;
  title: string;
  proofUrl?: string | null;
  winnerArtKind?: string | null;
  winnerWatermarked?: boolean | number | null;
  /**
   * Prelisted basenames (e.g. paper + Live merge). When omitted, reads
   * `art.*` from {@link packCardDir}.
   */
  artFiles?: readonly string[];
  /**
   * Override role source token per basename (Pokémon `live` / `coleka`…).
   * Default = stem after `art.`.
   */
  sourceTokenForFile?: (file: string) => string;
  /**
   * Per-file Affiche provenance (Naruto marketplace dumps → `listing_photo`).
   * Default = `catalog`.
   */
  coverProvenanceForFile?: (
    file: string,
  ) => NonNullable<MetadataAttachment["coverProvenance"]>;
};

export type CatalogueDiskFaceAttachmentsResult = {
  attachments: MetadataAttachment[];
  defaultUrl: string | null;
};

/** List `art.*` face dumps in a card folder (corrected / reconstructed included). */
export function listCatalogueArtBasenames(cardDir: string): string[] {
  if (!existsSync(cardDir)) return [];
  try {
    return readdirSync(cardDir).filter((name) =>
      name.toLowerCase().startsWith("art."),
    );
  } catch {
    return [];
  }
}

/**
 * Build Affiche cover attachments for every on-disk face dump.
 * Empty when the folder has no `art.*` (remote-only prints stay on `imageUrl`).
 */
export function buildCatalogueDiskFaceAttachments(
  input: CatalogueDiskFaceAttachmentsInput,
): CatalogueDiskFaceAttachmentsResult {
  const cardDir = packCardDir(input.packId, input.diskId);
  const arts = (
    input.artFiles?.length
      ? [...input.artFiles]
      : listCatalogueArtBasenames(cardDir)
  ).filter(Boolean);
  if (arts.length === 0) {
    return { attachments: [], defaultUrl: null };
  }

  const preferred = input.preferredArt?.trim() || null;
  const defaultArt =
    (preferred && arts.includes(preferred) ? preferred : null) ?? arts[0]!;
  const ordered = [
    defaultArt,
    ...arts.filter((file) => file !== defaultArt),
  ];
  const indexedWinner =
    input.indexedWinnerArt?.trim() || preferred || defaultArt;

  const faceLang = input.diskId.lang.trim().toLowerCase();
  const proofUrl = input.proofUrl?.trim() || null;
  const title = input.title.trim();

  const attachments: MetadataAttachment[] = ordered.map((file) => {
    const sourceHint = file.replace(/^art\./i, "").replace(/\.[^.]+$/, "");
    const sourceToken =
      input.sourceTokenForFile?.(file) || sourceHint || "art";
    const meta = resolveDiskFaceAttachmentMeta({
      artFile: file,
      isIndexedWinner: file === indexedWinner,
      winnerArtKind: input.winnerArtKind,
      winnerWatermarked: input.winnerWatermarked,
    });
    return {
      type: "cover",
      url: assetsCardUrl(input.packId, input.diskId, file),
      title: title || sourceToken,
      role: tcgFaceAttachmentRole({
        printGame: input.printGame,
        lang: faceLang || null,
        source: sourceToken,
      }),
      source: input.providerId,
      coverProvenance:
        input.coverProvenanceForFile?.(file) ?? "catalog",
      ...(proofUrl ? { sourceUrl: proofUrl } : {}),
      artKind: meta.artKind,
      watermarked: meta.watermarked,
    };
  });

  return {
    attachments,
    defaultUrl: assetsCardUrl(input.packId, input.diskId, defaultArt),
  };
}
