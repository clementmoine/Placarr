/**
 * Verify the publisher signing certificate of an APK (APK Signature Scheme v2/v3)
 * via `apksigner` (Android SDK build-tools). Used to pin the trusted signer
 * before an APK from a third-party mirror is promoted to staging.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const APKSIGNER_CANDIDATES = [
  process.env.APKSIGNER_PATH,
  "/Users/clement.moine/Library/Android/sdk/build-tools/36.0.0/apksigner",
  "/Users/clement.moine/Library/Android/sdk/build-tools/35.0.0/apksigner",
  "/opt/homebrew/share/android-commandlinetools/build-tools/35.0.0/apksigner",
  "apksigner",
].filter(Boolean) as string[];

export function findApksigner(): string | null {
  for (const c of APKSIGNER_CANDIDATES) {
    try {
      execFileSync(c, ["--version"], { stdio: "ignore" });
      return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

export type ApkSignatureResult = {
  ok: boolean;
  reason: string;
  actual: string | null;
  expected: string | null;
};

/**
 * Extract the SHA-256 digest of the APK's primary signer certificate.
 * Returns null if apksigner is unavailable or the APK is unsigned/unreadable.
 */
export function apkSignerCertSha256(apkPath: string): string | null {
  const bin = findApksigner();
  if (!bin) return null;
  try {
    const out = execFileSync(
      bin,
      ["verify", "--print-certs", apkPath],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const m = /Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F:]+)/.exec(
      out,
    );
    if (!m) return null;
    return m[1].replace(/:/g, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Verify that `apkPath` is signed by the certificate whose SHA-256 is
 * `expectedSha256`. If `expectedSha256` is null, verification is skipped
 * (returns ok with reason "no-pin").
 */
export function verifyApkSignature(
  apkPath: string,
  expectedSha256: string | null,
): ApkSignatureResult {
  if (!expectedSha256) {
    return { ok: true, reason: "no-pin", actual: null, expected: null };
  }
  const bin = findApksigner();
  if (!bin) {
    return {
      ok: true,
      reason: "apksigner-unavailable (skipped)",
      actual: null,
      expected: expectedSha256,
    };
  }
  const actual = apkSignerCertSha256(apkPath);
  if (!actual) {
    return {
      ok: false,
      reason: "could not read signer certificate",
      actual: null,
      expected: expectedSha256,
    };
  }
  if (actual !== expectedSha256.toLowerCase()) {
    return {
      ok: false,
      reason: `signer mismatch: ${actual} != ${expectedSha256}`,
      actual,
      expected: expectedSha256,
    };
  }
  return { ok: true, reason: "ok", actual, expected: expectedSha256 };
}