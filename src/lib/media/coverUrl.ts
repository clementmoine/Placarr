/** Normalizes a localized cover path so crop derivatives match their source file. */
export function stripCropSuffixFromUrl(url: string): string {
  return url.replace(/_crop(\.[^.]+)$/, "$1");
}

export function urlsReferToSameLocalizedImage(a: string, b: string): boolean {
  return stripCropSuffixFromUrl(a) === stripCropSuffixFromUrl(b);
}
