import { uploadImage } from "@/lib/api/upload";
import { isServedLocalPath } from "@/lib/media/servedLocalPaths";
import {
  remoteImageDisplaySrc,
  remoteImageNeedsProxy,
  remoteImageProxyPath,
} from "@/core/enrich/media/remoteImageDisplay";

export type FormImageValue = string | File | null | undefined;

function isDataImageUrl(url: string): boolean {
  return /^data:image\/[a-zA-Z+]+;base64,/i.test(url);
}

function isRemoteHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Reverse `/api/media/remote?url=…` back to the canonical remote URL. */
export function canonicalRemoteImageUrl(url: string): string {
  if (!url.startsWith("/api/media/remote")) return url;
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.searchParams.get("url")?.trim() || url;
  } catch {
    return url;
  }
}

function shouldClientLocalizeRemoteUrl(url: string): boolean {
  const canonical = canonicalRemoteImageUrl(url);
  return (
    url.startsWith("/api/media/remote") ||
    (isRemoteHttpUrl(canonical) && remoteImageNeedsProxy(canonical))
  );
}

function fetchUrlForSubmit(url: string): string {
  const canonical = canonicalRemoteImageUrl(url);
  return remoteImageDisplaySrc(canonical);
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/svg+xml") return "svg";
  return "jpg";
}

async function blobToUploadUrl(
  blob: Blob,
  options: { trim?: boolean },
): Promise<string> {
  const mimeType = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  const extension = extensionForMimeType(mimeType);
  const file = new File([blob], `cover.${extension}`, { type: mimeType });
  return uploadImage(file, options);
}

async function dataUrlToUploadUrl(
  dataUrl: string,
  options: { trim?: boolean },
): Promise<string> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return blobToUploadUrl(blob, options);
}

/**
 * Persist a form image field: local paths unchanged, `File` / data-URL uploaded,
 * Referer-protected CDN URLs left for the API localizer (budget + optional
 * remote fallback) so Affiche pins keep their provider row.
 */
export async function localizeImageFieldForSubmit(
  value: FormImageValue,
  options: { trim?: boolean } = {},
): Promise<string | File | null | undefined> {
  if (value == null) return value;
  if (value instanceof File) {
    return uploadImage(value, options);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isServedLocalPath(trimmed)) return trimmed;

  if (isDataImageUrl(trimmed)) {
    return dataUrlToUploadUrl(trimmed, options);
  }

  if (!shouldClientLocalizeRemoteUrl(trimmed)) {
    return trimmed;
  }

  /*
    Affiche pin of a Referer/Cloudflare CDN (Booknode, …): do not Flare-fetch
    here. The items API `downloadRemoteImage` localizes with a short budget and
    may keep the remote URL (`remoteImageFallback`) — that preserves the
    provider row the collector picked. A client-side twin rewrite or a second
    8–90s Flare pass made Enregistrer slow and re-selected BDovore after save.
  */
  return trimmed;
}

/** @internal test hook */
export function submitFetchUrlForRemoteImage(url: string): string | null {
  if (!shouldClientLocalizeRemoteUrl(url)) return null;
  const proxyPath = remoteImageProxyPath(canonicalRemoteImageUrl(url));
  return proxyPath ?? fetchUrlForSubmit(url);
}
