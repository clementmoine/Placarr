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

async function fetchRemoteImageBlob(url: string): Promise<Blob | null> {
  const response = await fetch(fetchUrlForSubmit(url), {
    credentials: "same-origin",
  });
  if (!response.ok) return null;

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) return null;
  return blob;
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
 * Persist a form image field: an already-served local path unchanged, `File` uploaded as-is,
 * referer-protected remote URLs fetched via the UI proxy then uploaded. Other remote
 * URLs are left for the API's server-side localizer.
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

  try {
    const blob = await fetchRemoteImageBlob(trimmed);
    if (!blob) return trimmed;
    return blobToUploadUrl(blob, options);
  } catch {
    return trimmed;
  }
}

/** @internal test hook */
export function submitFetchUrlForRemoteImage(url: string): string | null {
  if (!shouldClientLocalizeRemoteUrl(url)) return null;
  const proxyPath = remoteImageProxyPath(canonicalRemoteImageUrl(url));
  return proxyPath ?? fetchUrlForSubmit(url);
}
