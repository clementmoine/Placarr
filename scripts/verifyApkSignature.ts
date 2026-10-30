/**
 * Verify the publisher signature of on-disk APKs against the pinned cert.
 * Usage: pnpm apk:verify [--pack pokemon|lorcana]
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { packApksDir } from "@/lib/packPaths";
import {
  APK_SIGNER_CERT_SHA256 as PINS,
} from "@/lib/admin/apkStoreFetch";
import { verifyApkSignature } from "@/lib/admin/apkSignature";

function main() {
  const args = process.argv.slice(2);
  const packs = args.includes("--pack")
    ? [args[args.indexOf("--pack") + 1]]
    : ["pokemon", "lorcana"];
  for (const pack of packs) {
    const dir = packApksDir(pack);
    if (!existsSync(dir)) {
      console.log(`[${pack}] no apks dir`);
      continue;
    }
    for (const name of readdirSync(dir).filter((n) => n.endsWith(".apk"))) {
      const p = path.join(dir, name);
      const r = verifyApkSignature(p, PINS[pack] ?? null);
      console.log(`[${pack}] ${name}: ${r.ok ? "OK" : "FAIL"} — ${r.reason}`);
    }
  }
}
main();