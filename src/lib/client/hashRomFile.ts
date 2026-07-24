/**
 * Client-side ROM dump hashing — never uploads the file.
 * Streams File/Blob in chunks so multi-GB ISOs are not loaded fully into RAM.
 */
import type { RomChecksums } from "@/types/providerModule";

/** Soft UX warn before hashing a large dump (still local / non-blocking). */
export const ROM_HASH_SOFT_WARN_BYTES = 256 * 1024 * 1024;

/** Default slice size for File/Blob streaming. */
export const ROM_HASH_CHUNK_BYTES = 1024 * 1024;

export function shouldWarnRomHashSize(byteLength: number): boolean {
  return Number.isFinite(byteLength) && byteLength >= ROM_HASH_SOFT_WARN_BYTES;
}

/** Whole MiB for toast copy (e.g. 512). */
export function formatRomHashSizeMiB(byteLength: number): string {
  if (!Number.isFinite(byteLength) || byteLength < 0) return "0";
  return String(Math.max(1, Math.round(byteLength / (1024 * 1024))));
}

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

type IncrementalHexHasher = {
  update: (bytes: Uint8Array) => void;
  digest: () => string;
};

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

function createCrc32(): IncrementalHexHasher {
  let crc = 0xffffffff;
  return {
    update(bytes) {
      for (let i = 0; i < bytes.length; i++) {
        crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
      }
    },
    digest() {
      return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
    },
  };
}

/** IEEE CRC-32 (same as No-Intro / ZIP). */
export function crc32Hex(bytes: Uint8Array): string {
  const hasher = createCrc32();
  hasher.update(bytes);
  return hasher.digest();
}

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
  9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
  16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
  15, 21,
];

const MD5_K = (() => {
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  }
  return K;
})();

function createMd5(): IncrementalHexHasher {
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  let totalLen = 0;
  const buffer = new Uint8Array(64);
  let bufferLen = 0;

  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));

  const processBlock = (block: Uint8Array) => {
    const view = new DataView(block.buffer, block.byteOffset, 64);
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      M[i] = view.getUint32(i * 4, true);
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
      F = (F + A + MD5_K[i]! + M[g]!) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotl(F, MD5_S[i]!)) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  };

  return {
    update(bytes) {
      totalLen += bytes.length;
      let offset = 0;
      if (bufferLen > 0) {
        const take = Math.min(64 - bufferLen, bytes.length);
        buffer.set(bytes.subarray(0, take), bufferLen);
        bufferLen += take;
        offset = take;
        if (bufferLen === 64) {
          processBlock(buffer);
          bufferLen = 0;
        }
      }
      while (offset + 64 <= bytes.length) {
        processBlock(bytes.subarray(offset, offset + 64));
        offset += 64;
      }
      if (offset < bytes.length) {
        buffer.set(bytes.subarray(offset));
        bufferLen = bytes.length - offset;
      }
    },
    digest() {
      const bitLenLo = (totalLen * 8) >>> 0;
      const bitLenHi = Math.floor(totalLen / 0x20000000);
      const pad = new Uint8Array(bufferLen < 56 ? 64 - bufferLen : 128 - bufferLen);
      pad[0] = 0x80;
      const view = new DataView(pad.buffer);
      view.setUint32(pad.length - 8, bitLenLo, true);
      view.setUint32(pad.length - 4, bitLenHi, true);
      this.update(pad);

      const out = new Uint8Array(16);
      const outView = new DataView(out.buffer);
      outView.setUint32(0, a0, true);
      outView.setUint32(4, b0, true);
      outView.setUint32(8, c0, true);
      outView.setUint32(12, d0, true);
      return toHex(out);
    },
  };
}

/**
 * Compact MD5 (RFC 1321) for dump indexes — Web Crypto does not expose MD5.
 */
export function md5Hex(bytes: Uint8Array): string {
  const hasher = createMd5();
  hasher.update(bytes);
  return hasher.digest();
}

function createSha1(): IncrementalHexHasher {
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  let totalLen = 0;
  const buffer = new Uint8Array(64);
  let bufferLen = 0;

  const processBlock = (block: Uint8Array) => {
    const view = new DataView(block.buffer, block.byteOffset, 64);
    const w = new Uint32Array(80);
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(i * 4, false);
    }
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = ((x << 1) | (x >>> 31)) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp =
        (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  };

  return {
    update(bytes) {
      totalLen += bytes.length;
      let offset = 0;
      if (bufferLen > 0) {
        const take = Math.min(64 - bufferLen, bytes.length);
        buffer.set(bytes.subarray(0, take), bufferLen);
        bufferLen += take;
        offset = take;
        if (bufferLen === 64) {
          processBlock(buffer);
          bufferLen = 0;
        }
      }
      while (offset + 64 <= bytes.length) {
        processBlock(bytes.subarray(offset, offset + 64));
        offset += 64;
      }
      if (offset < bytes.length) {
        buffer.set(bytes.subarray(offset));
        bufferLen = bytes.length - offset;
      }
    },
    digest() {
      const bitLenHi = Math.floor(totalLen / 0x20000000);
      const bitLenLo = (totalLen * 8) >>> 0;
      const pad = new Uint8Array(bufferLen < 56 ? 64 - bufferLen : 128 - bufferLen);
      pad[0] = 0x80;
      const view = new DataView(pad.buffer);
      view.setUint32(pad.length - 8, bitLenHi, false);
      view.setUint32(pad.length - 4, bitLenLo, false);
      this.update(pad);

      const out = new Uint8Array(20);
      const outView = new DataView(out.buffer);
      outView.setUint32(0, h0, false);
      outView.setUint32(4, h1, false);
      outView.setUint32(8, h2, false);
      outView.setUint32(12, h3, false);
      outView.setUint32(16, h4, false);
      return toHex(out);
    },
  };
}

export function sha1Hex(bytes: Uint8Array): string {
  const hasher = createSha1();
  hasher.update(bytes);
  return hasher.digest();
}

export function dumpTitleFromFileName(fileName: string): string {
  const base = fileName.trim().split(/[/\\]/).pop() || fileName.trim();
  return base.replace(/\.[^.]+$/u, "").trim() || base;
}

export type RomHashProgress = {
  bytesRead: number;
  totalBytes: number;
  /** 0..1 inclusive when complete. */
  ratio: number;
};

export type HashRomFileOptions = {
  /** Override streaming slice size (tests / constrained memory). */
  chunkBytes?: number;
  /** Called after each chunk (and once at start with 0). */
  onProgress?: (progress: RomHashProgress) => void;
};

/** Whole percent 0–100 for button / toast copy. */
export function romHashProgressPercent(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  if (ratio >= 1) return 100;
  return Math.min(99, Math.max(0, Math.floor(ratio * 100)));
}

function inputByteLength(
  input: File | Blob | ArrayBuffer | Uint8Array,
): number {
  if (input instanceof Uint8Array) return input.byteLength;
  if (input instanceof ArrayBuffer) return input.byteLength;
  return input.size;
}

async function* chunksFromInput(
  input: File | Blob | ArrayBuffer | Uint8Array,
  chunkBytes: number,
): AsyncGenerator<Uint8Array> {
  if (input instanceof Uint8Array) {
    yield input;
    return;
  }
  if (input instanceof ArrayBuffer) {
    yield new Uint8Array(input);
    return;
  }

  const size = input.size;
  const step = Math.max(1, chunkBytes);
  for (let offset = 0; offset < size; offset += step) {
    const end = Math.min(offset + step, size);
    yield new Uint8Array(await input.slice(offset, end).arrayBuffer());
  }
}

/** Hash a local dump in streaming chunks. Does not upload or retain the file. */
export async function hashRomFile(
  input: File | Blob | ArrayBuffer | Uint8Array,
  options?: HashRomFileOptions,
): Promise<RomChecksums> {
  const chunkBytes = options?.chunkBytes ?? ROM_HASH_CHUNK_BYTES;
  const totalBytes = inputByteLength(input);
  const onProgress = options?.onProgress;
  const crc = createCrc32();
  const md5 = createMd5();
  const sha1 = createSha1();

  let bytesRead = 0;
  onProgress?.({ bytesRead: 0, totalBytes, ratio: totalBytes === 0 ? 1 : 0 });

  for await (const chunk of chunksFromInput(input, chunkBytes)) {
    crc.update(chunk);
    md5.update(chunk);
    sha1.update(chunk);
    bytesRead += chunk.byteLength;
    const ratio =
      totalBytes <= 0 ? 1 : Math.min(1, bytesRead / totalBytes);
    onProgress?.({ bytesRead, totalBytes, ratio });
  }

  return {
    crc: crc.digest(),
    md5: md5.digest(),
    sha1: sha1.digest(),
  };
}
