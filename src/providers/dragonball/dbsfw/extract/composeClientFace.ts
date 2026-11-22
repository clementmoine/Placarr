/**
 * Face catalogue Fusion World composée sur CPU — remplace le bake WebGL /
 * Chrome (`bakeClientFaceS3tc`, supprimé le 2026-11-21).
 *
 * Même pile et même fusion que le fragment shader d'origine : fond blanc
 * opaque, puis `over` en alpha droit, calque après calque, dans l'ordre Frost
 * (`frostCatalogueComposeOrder`). Différence voulue : chaque calque est
 * réduit à la taille de la carte en **Lanczos3** (sharp / libvips, alpha
 * prémultiplié pendant le redimensionnement) au lieu d'un bilinéaire sans
 * mipmaps — texte et contours plus nets, aucun repliement. Les calques
 * viennent du décodeur conforme `src/lib/unity/bcn.ts`.
 *
 * Choix produit et mesures : docs/backlog/2026-11-21-fw-faces-sans-gpu.md.
 */
import sharp from "sharp";

export type ComposeClientFaceLayer = {
  rgba: Buffer;
  width: number;
  height: number;
};

/**
 * Réduction d'un calque à la taille de la carte — la seule utilisée par
 * Fusion World : face produit et calques `layer.*.webp` du foil.
 */
export async function resizeClientFaceLayer(
  layer: ComposeClientFaceLayer,
  width: number,
  height: number,
): Promise<Buffer> {
  if (layer.width === width && layer.height === height) return layer.rgba;
  return sharp(layer.rgba, {
    raw: { width: layer.width, height: layer.height, channels: 4 },
  })
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();
}

/**
 * Compose les calques (du dessous vers le dessus) en une face opaque RGBA
 * `width` × `height`.
 */
export async function composeClientFaceRgba(
  layers: readonly ComposeClientFaceLayer[],
  width: number,
  height: number,
): Promise<Buffer> {
  const pixels = width * height;
  const r = new Float32Array(pixels).fill(1);
  const g = new Float32Array(pixels).fill(1);
  const b = new Float32Array(pixels).fill(1);
  const a = new Float32Array(pixels).fill(1);
  for (const layer of layers) {
    const src = await resizeClientFaceLayer(layer, width, height);
    for (let i = 0; i < pixels; i++) {
      const la = src[i * 4 + 3]! / 255;
      if (la === 0) continue;
      const na = la + a[i]! * (1 - la);
      if (na < 1e-5) {
        r[i] = g[i] = b[i] = a[i] = 0;
        continue;
      }
      const keep = a[i]! * (1 - la);
      r[i] = ((src[i * 4]! / 255) * la + r[i]! * keep) / na;
      g[i] = ((src[i * 4 + 1]! / 255) * la + g[i]! * keep) / na;
      b[i] = ((src[i * 4 + 2]! / 255) * la + b[i]! * keep) / na;
      a[i] = na;
    }
  }
  const out = Buffer.alloc(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    out[i * 4] = Math.round(Math.min(1, Math.max(0, r[i]!)) * 255);
    out[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, g[i]!)) * 255);
    out[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, b[i]!)) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}
