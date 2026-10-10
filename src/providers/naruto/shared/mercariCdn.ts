/**
 * Live Mercari CDN helpers for TCG face install.
 * Listing pages → `static.mercdn.net/item/detail/orig/photos/{mId}_{n}.jpg`.
 */
import { httpGet } from "@/lib/http/httpClient";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const MIN_BYTES = 8_000;

export function mercariItemIdFromListing(listingUrl: string): string | null {
  const m = /(?:^|\/)(m\d{8,})\b/i.exec(listingUrl);
  return m?.[1]?.toLowerCase() ?? null;
}

/** Default photo index is `_1` (first gallery shot). */
export function mercariOrigPhotoUrl(
  listingOrItemId: string,
  photoIndex = 1,
): string | null {
  const id = mercariItemIdFromListing(listingOrItemId) ??
    (/^m\d{8,}$/i.test(listingOrItemId) ? listingOrItemId.toLowerCase() : null);
  if (!id) return null;
  const n = Math.max(1, Math.floor(photoIndex));
  return `https://static.mercdn.net/item/detail/orig/photos/${id}_${n}.jpg`;
}

function looksLikeImage(buf: Buffer): boolean {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return true;
  }
  if (buf.length >= 8 && buf.subarray(1, 4).toString("ascii") === "PNG") {
    return true;
  }
  if (buf.length >= 12 && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return true;
  }
  return false;
}

export async function downloadMercariOrigPhoto(
  url: string,
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/jpeg,image/*,*/*;q=0.8",
        Referer: "https://jp.mercari.com/",
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (!looksLikeImage(buf) || buf.byteLength < MIN_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}
