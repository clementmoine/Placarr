/**
 * Décodeur BC1 (DXT1) / BC3 (DXT5) conforme à la spec D3D10, en TypeScript.
 *
 * Remplace `decodeBc1` / `decodeBc3` de `@arkntools/unity-js-tools`, dont
 * l'alpha BC3 est faux aux pixels 10 à 15 de chaque bloc (index au-delà du
 * 32e bit mal extraits par la compilation wasm-bindgen) : c'était le
 * « tramage 4×4 » des faces Fusion World. Vérifié face aux bakes GPU réels :
 * 59,8 dB en moyenne sur 60 cartes, écart max 3/255
 * (docs/backlog/2026-11-21-fw-faces-sans-gpu.md).
 *
 * Sortie RGBA8, lignes dans l'ordre des données (comme le paquet : l'appelant
 * retourne l'image si besoin). DXT1 Unity est un format RGB : en mode
 * 3 couleurs, l'index 3 est du noir **opaque**. BC3 décode toujours sa
 * couleur en mode 4 couleurs.
 */

function expand565(c: number, out: Uint8Array, at: number): void {
  const r = (c >> 11) & 31;
  const g = (c >> 5) & 63;
  const b = c & 31;
  out[at] = (r << 3) | (r >> 2);
  out[at + 1] = (g << 2) | (g >> 4);
  out[at + 2] = (b << 3) | (b >> 2);
}

/** Palette RGB de 4 entrées (12 octets) pour un bloc couleur. */
function colorPalette(
  data: Uint8Array,
  o: number,
  forceFourColor: boolean,
  pal: Uint8Array,
): void {
  const c0 = data[o]! | (data[o + 1]! << 8);
  const c1 = data[o + 2]! | (data[o + 3]! << 8);
  expand565(c0, pal, 0);
  expand565(c1, pal, 3);
  if (forceFourColor || c0 > c1) {
    for (let i = 0; i < 3; i++) {
      pal[6 + i] = Math.round((2 * pal[i]! + pal[3 + i]!) / 3);
      pal[9 + i] = Math.round((pal[i]! + 2 * pal[3 + i]!) / 3);
    }
  } else {
    for (let i = 0; i < 3; i++) {
      pal[6 + i] = Math.round((pal[i]! + pal[3 + i]!) / 2);
      pal[9 + i] = 0;
    }
  }
}

/** Palette alpha de 8 entrées pour un bloc alpha BC3. */
function alphaPalette(a0: number, a1: number, pal: Uint8Array): void {
  pal[0] = a0;
  pal[1] = a1;
  if (a0 > a1) {
    for (let i = 1; i < 7; i++) {
      pal[1 + i] = Math.round(((7 - i) * a0 + i * a1) / 7);
    }
  } else {
    for (let i = 1; i < 5; i++) {
      pal[1 + i] = Math.round(((5 - i) * a0 + i * a1) / 5);
    }
    pal[6] = 0;
    pal[7] = 255;
  }
}

function decodeBlocks(
  data: Uint8Array,
  width: number,
  height: number,
  bc3: boolean,
): Buffer {
  const out = Buffer.alloc(width * height * 4);
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  const blockBytes = bc3 ? 16 : 8;
  const pal = new Uint8Array(12);
  const apal = new Uint8Array(8);
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const o = (by * blocksX + bx) * blockBytes;
      if (o + blockBytes > data.length) return out;
      const co = bc3 ? o + 8 : o;
      colorPalette(data, co, bc3, pal);
      const colorBits =
        (data[co + 4]! |
          (data[co + 5]! << 8) |
          (data[co + 6]! << 16) |
          (data[co + 7]! << 24)) >>>
        0;
      // Index alpha sur 48 bits, lus en deux mots de 24 bits : aucun décalage
      // ne dépasse 32 bits (c'est là que le décodeur précédent se trompait).
      let alphaLo = 0;
      let alphaHi = 0;
      if (bc3) {
        alphaPalette(data[o]!, data[o + 1]!, apal);
        alphaLo = data[o + 2]! | (data[o + 3]! << 8) | (data[o + 4]! << 16);
        alphaHi = data[o + 5]! | (data[o + 6]! << 8) | (data[o + 7]! << 16);
      }
      for (let k = 0; k < 16; k++) {
        const x = bx * 4 + (k & 3);
        const y = by * 4 + (k >> 2);
        if (x >= width || y >= height) continue;
        const ci = (colorBits >>> (2 * k)) & 3;
        const at = (y * width + x) * 4;
        out[at] = pal[ci * 3]!;
        out[at + 1] = pal[ci * 3 + 1]!;
        out[at + 2] = pal[ci * 3 + 2]!;
        if (bc3) {
          const ai =
            k < 8 ? (alphaLo >> (3 * k)) & 7 : (alphaHi >> (3 * (k - 8))) & 7;
          out[at + 3] = apal[ai]!;
        } else {
          out[at + 3] = 255;
        }
      }
    }
  }
  return out;
}

/** BC1 / DXT1 → RGBA8 (index 3 du mode 3 couleurs = noir opaque). */
export function decodeBc1Rgba(
  data: Uint8Array,
  width: number,
  height: number,
): Buffer {
  return decodeBlocks(data, width, height, false);
}

/** BC3 / DXT5 → RGBA8 (couleur toujours en mode 4 couleurs). */
export function decodeBc3Rgba(
  data: Uint8Array,
  width: number,
  height: number,
): Buffer {
  return decodeBlocks(data, width, height, true);
}
