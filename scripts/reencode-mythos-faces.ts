/**
 * One-shot: re-encode Mythos on-disk `art.*.webp` that are still PNG/JPEG
 * bytes, or that still carry a transparent CICABOOM gutter.
 *
 *   pnpm exec tsx scripts/reencode-mythos-faces.ts
 */
import { reencodeMythosDiskFaces } from "@/providers/naruto/narutomythos/sources/faces";

const result = await reencodeMythosDiskFaces();
console.log(result);
