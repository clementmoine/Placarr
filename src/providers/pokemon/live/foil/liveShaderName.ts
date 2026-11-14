/**
 * Live foil stem. The shared decoder names a fragment from the parsed asset
 * path. Live also stamps this prefix inside the blob when `m_Name` is generic.
 */

import type { ShaderFragNameInput } from "@/lib/unity/shader";

const LIVE_FOIL_PATH_RE =
  /TPCi\/Cards3D\/(?:HoloFoil|Standard)\/([A-Za-z0-9]+)/;

export function resolveLiveFoilName(input: ShaderFragNameInput): string | null {
  if (input.parsedName.startsWith("TPCi/Cards3D/")) {
    return input.parsedName.split("/").pop() ?? null;
  }
  const decoder = new TextDecoder("utf-8", { fatal: false });
  for (const { data } of input.chunks) {
    const match = LIVE_FOIL_PATH_RE.exec(decoder.decode(data));
    if (match?.[1]) return match[1];
  }
  return null;
}
