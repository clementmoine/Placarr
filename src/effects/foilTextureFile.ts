/**
 * Unity dump stems (and legacy ``.png`` paths) → on-disk foil texture filename.
 * Extracts write lossless ``.webp``; URL builders always prefer that extension.
 */
export function foilTextureFile(tex: string): string {
  const t = tex.trim();
  if (!t) return t;
  if (/\.webp$/i.test(t)) return t;
  if (/\.png$/i.test(t)) return t.replace(/\.png$/i, ".webp");
  return `${t}.webp`;
}
