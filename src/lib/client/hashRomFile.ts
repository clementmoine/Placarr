/**
 * Client-side ROM dump hashing — never uploads the file.
 * Prefer SHA-1 (Web Crypto), plus CRC32 / MD5 for No-Intro index coverage.
 */
import type { RomChecksums } from "@/types/providerModule";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/** IEEE CRC-32 (same as No-Intro / ZIP). */
export function crc32Hex(bytes: Uint8Array): string {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < view.length; i++) {
    out += view[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Compact MD5 (RFC 1321) for dump indexes — Web Crypto does not expose MD5.
 */
export function md5Hex(bytes: Uint8Array): string {
  const length = bytes.length;
  const bitLenLo = (length * 8) >>> 0;
  const bitLenHi = Math.floor(length / 0x20000000);

  const withPadding = new Uint8Array(((length + 9 + 63) & ~63) >>> 0);
  withPadding.set(bytes);
  withPadding[length] = 0x80;
  const view = new DataView(withPadding.buffer);
  view.setUint32(withPadding.length - 8, bitLenLo, true);
  view.setUint32(withPadding.length - 4, bitLenHi, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
    9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
    16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
    15, 21,
  ];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  }

  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));

  for (let offset = 0; offset < withPadding.length; offset += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      M[i] = view.getUint32(offset + i * 4, true);
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i]! + M[g]!) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotl(F, S[i]!)) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return toHex(out);
}

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto SHA-1 unavailable");
  }
  // subtle.digest requires a BufferSource with ArrayBuffer (not SharedArrayBuffer).
  const copy = new Uint8Array(bytes);
  const digest = await subtle.digest("SHA-1", copy);
  return toHex(digest);
}

export function dumpTitleFromFileName(fileName: string): string {
  const base = fileName.trim().split(/[/\\]/).pop() || fileName.trim();
  return base.replace(/\.[^.]+$/u, "").trim() || base;
}

async function bytesFromInput(
  input: File | Blob | ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}

/** Hash a local dump in-memory. Does not upload or retain the file. */
export async function hashRomFile(
  input: File | Blob | ArrayBuffer | Uint8Array,
): Promise<RomChecksums> {
  const bytes = await bytesFromInput(input);
  const [sha1, crc, md5] = await Promise.all([
    sha1Hex(bytes),
    Promise.resolve(crc32Hex(bytes)),
    Promise.resolve(md5Hex(bytes)),
  ]);
  return { sha1, crc, md5 };
}
