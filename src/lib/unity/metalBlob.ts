/**
 * Unity player shader blob (platform 14, Metal) → embedded MSL text.
 *
 * After LZ4, the chunk is a table of segments:
 *   uint32 count
 *   count × (uint32 offset, uint32 length, uint32 flags)
 * Each segment that holds a program starts its source at
 * `#include <metal_stdlib>` and ends at the next NUL.
 */

export type MetalProgramSource = {
  stage: "vertex" | "fragment";
  source: string;
};

const METAL_MARK = "#include <metal_stdlib>";

function stageOf(source: string): "vertex" | "fragment" | null {
  if (/(^|\n)fragment\s+/.test(source)) return "fragment";
  if (/(^|\n)vertex\s+/.test(source)) return "vertex";
  return null;
}

/** Metal sources embedded in one decompressed Unity shader chunk. */
export function metalSourcesFromBlob(data: Uint8Array): MetalProgramSource[] {
  if (data.byteLength < 16) return [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = view.getUint32(0, true);
  if (count <= 0 || count > 4096) return [];
  const tableBytes = 4 + count * 12;
  if (tableBytes > data.byteLength) return [];

  const out: MetalProgramSource[] = [];
  const text = new TextDecoder("latin1");
  for (let i = 0; i < count; i++) {
    const offset = view.getUint32(4 + i * 12, true);
    const length = view.getUint32(8 + i * 12, true);
    if (length <= 0 || offset + length > data.byteLength) continue;
    const segment = text.decode(data.subarray(offset, offset + length));
    const at = segment.indexOf(METAL_MARK);
    if (at < 0) continue;
    const nul = segment.indexOf("\0", at);
    const source = nul < 0 ? segment.slice(at) : segment.slice(at, nul);
    const stage = stageOf(source);
    if (!stage) continue;
    out.push({ stage, source });
  }
  return out;
}
