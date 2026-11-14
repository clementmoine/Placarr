/**
 * Write then rename — avoids truncated shards if the process dies mid-write.
 */
import { renameSync, writeFileSync } from "node:fs";

export function writeFileAtomic(
  dest: string,
  data: string | NodeJS.ArrayBufferView,
): void {
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, dest);
}
