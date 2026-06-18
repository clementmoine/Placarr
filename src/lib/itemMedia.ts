/**
 * itemMedia.ts — Helpers de priorité d'affichage des médias
 *
 * Ces fonctions centralisent les règles de "quoi afficher et dans quel ordre"
 * dans toute l'application, en tenant compte des types d'attachments structurés.
 */

import type { Attachment } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MediaItem {
  url: string;
  type: string;
  source?: string | null;
  role?: string | null;
}

// Input type common to helpers
export interface MediaInput {
  imageUrl?: string | null;
  metadata?: {
    imageUrl?: string | null;
    sourceType?: string | null;
    attachments?: any[] | null;
  } | null;
  shelf?: {
    type?: string | null;
  } | null;
}

// ─── Priorité source pour les covers ─────────────────────────────────────────
// screenscraper > physical catalog scans > digital artwork fallbacks.
const COVER_SOURCE_PRIORITY = [
  "barcode",
  "screenscraper",
  "steamgriddb",
  "coverproject",
  "igdb",
  "rawg",
  "steam",
];

function getSourceScore(a: MediaItem, type: string): number {
  const source = a.source ?? "";
  const role = a.role ?? "";
  const roleLower = role.toLowerCase();

  if (type === "games") {
    // Objectif : une vraie BOÎTE en cover par défaut, peu importe la source.
    if (source === "screenscraper") {
      if (roleLower.includes("mixrbv")) return 90; // garde-fou (normalement non émis)
      // Vraies boîtes plates box-2D, par région.
      if (role === "fr") return 1;
      if (role === "eu") return 2;
      if (role === "wor") return 3;
      if (role && !roleLower.endsWith("-3d")) return 4; // autres régions box-2D
      // box-3D (rendu en perspective) après les boîtes plates des autres sources.
      if (roleLower.endsWith("-3d")) return 8;
      return 9;
    }
    // SteamGridDB : grille verticale = format boîte → au-dessus du digital.
    if (source === "steamgriddb" && roleLower.includes("grid-vertical"))
      return 5;
    if (source === "coverproject") return 7;
    if (source === "barcode") return 10;
    if (source === "igdb") return 11; // covers digitales
    if (source === "rawg") return 12;
    if (source === "steam") return 13;
    if (source === "steamgriddb") return 14; // autres formats (horizontal, etc.)
    return 99;
  }

  if (type === "movies") {
    if (source === "tmdb") return 1;
    if (source === "barcode") return 2;
    return 99;
  }

  if (type === "books") {
    if (source === "openlibrary") return 1;
    if (source === "barcode") return 2;
    return 99;
  }

  if (type === "musics") {
    if (source === "deezer") return 1;
    if (source === "barcode") return 2;
    return 99;
  }

  const idx = COVER_SOURCE_PRIORITY.indexOf(source);
  return idx === -1 ? 99 : idx;
}

function sortBySource(
  items: MediaItem[],
  item?: {
    metadata?: { sourceType?: string | null } | null;
    shelf?: { type?: string | null } | null;
  },
): MediaItem[] {
  const type = item?.metadata?.sourceType ?? item?.shelf?.type ?? "games";

  return [...items].sort((a, b) => {
    const scoreA = getSourceScore(a, type);
    const scoreB = getSourceScore(b, type);
    return scoreA - scoreB;
  });
}

// ─── Image principale (ItemCard, header modal) ────────────────────────────────

/**
 * Retourne l'URL de l'image principale à afficher (jaquette).
 * Priorité:
 *   1. Item.imageUrl (photo prise par l'utilisateur)
 *   2. Attachment type=cover (screenscraper → igdb → toute source)
 *   3. Metadata.imageUrl (legacy / RAWG background_image)
 *   4. Attachment type=artwork[0]
 *   5. Attachment type=screenshot[0]
 */
export function getCoverImage(item: MediaInput): string | null {
  const type = item.metadata?.sourceType ?? item.shelf?.type ?? "games";

  // 1. Photo utilisateur / image locale explicite.
  // For games, legacy external covers from IGDB/RAWG should not hide
  // structured physical scans from ScreenScraper.
  const isExternalGameImage =
    type === "games" && /^https?:\/\//i.test(item.imageUrl || "");
  if (item.imageUrl && !isExternalGameImage) return item.imageUrl;

  const attachments = (item.metadata?.attachments ?? []) as MediaItem[];

  // 2. Cover typé (trié par source)
  const covers = attachments.filter((a) => a.type === "cover");
  if (covers.length > 0) {
    const sorted = sortBySource(covers, item);
    return sorted[0].url;
  }

  // 3. Legacy imageUrl (RAWG background_image, ScreenScraper sans type)
  if (item.metadata?.imageUrl) return item.metadata.imageUrl;

  // 4. Artwork
  const artwork = attachments.find((a) => a.type === "artwork");
  if (artwork) return artwork.url;

  // 5. Screenshot
  const screenshot = attachments.find((a) => a.type === "screenshot");
  if (screenshot) return screenshot.url;

  // 6. Legacy external item image fallback.
  if (item.imageUrl) return item.imageUrl;

  // 7. Image générique (backward compat)
  const generic = attachments.find((a) => a.type === "image");
  if (generic) return generic.url;

  return null;
}

// ─── Image de fond / Hero ─────────────────────────────────────────────────────

/**
 * Retourne l'image à utiliser en fond (hero section, page détail).
 * Priorité:
 *   1. Attachment type=background
 *   2. Attachment type=artwork[0] (IGDB 1080p)
 *   3. Attachment type=screenshot[0]
 *   4. getCoverImage() (fallback)
 */
export function getHeroImage(item: MediaInput): string | null {
  const attachments = (item.metadata?.attachments ?? []) as MediaItem[];

  const bg = attachments.find((a) => a.type === "background");
  if (bg) return bg.url;

  const artwork = attachments.find((a) => a.type === "artwork");
  if (artwork) return artwork.url;

  const screenshot = attachments.find((a) => a.type === "screenshot");
  if (screenshot) return screenshot.url;

  return getCoverImage(item);
}

// ─── Galerie complète (carousel, modal) ──────────────────────────────────────

/**
 * Retourne toutes les images pour la galerie, dans l'ordre d'affichage.
 * Ordre: cover → screenshots → artworks → images génériques
 * Dédupliqués par URL.
 */
export function getGalleryImages(item: MediaInput, max?: number): MediaItem[] {
  const seen = new Set<string>();
  const result: MediaItem[] = [];

  const add = (m: MediaItem) => {
    if (!seen.has(m.url)) {
      seen.add(m.url);
      result.push(m);
    }
  };

  const attachments = (item.metadata?.attachments ?? []) as MediaItem[];

  // Covers (sorted by source priority)
  sortBySource(
    attachments.filter((a) => a.type === "cover"),
    item,
  ).forEach(add);

  // Legacy imageUrl (if not already added)
  if (item.metadata?.imageUrl) {
    add({ url: item.metadata.imageUrl, type: "image" });
  }

  // Screenshots
  attachments.filter((a) => a.type === "screenshot").forEach(add);

  // Artworks
  attachments.filter((a) => a.type === "artwork").forEach(add);

  // Backgrounds
  attachments.filter((a) => a.type === "background").forEach(add);

  // Generic images
  attachments.filter((a) => a.type === "image").forEach(add);

  // User's own image last (already shown as cover, but include in gallery)
  if (item.imageUrl && !seen.has(item.imageUrl)) {
    add({ url: item.imageUrl, type: "image" });
  }

  return max ? result.slice(0, max) : result;
}

// ─── Label lisible pour le type ──────────────────────────────────────────────

export function getMediaTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    cover: "Cover",
    screenshot: "Screenshot",
    artwork: "Artwork",
    background: "Background",
    logo: "Logo",
    image: "Image",
    video: "Video",
    audio: "Audio",
    book: "Book",
  };
  return labels[type] ?? type;
}
