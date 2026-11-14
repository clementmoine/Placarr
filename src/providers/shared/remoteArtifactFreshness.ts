/**
 * Cheap remote / local artifact freshness — ETag, Last-Modified, content-length,
 * or local size:mtime — so catalogue Sync can skip download + rebuild.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  promises as fs,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet, httpHead } from "@/lib/http/httpClient";

export type RemoteArtifactValidators = {
  url?: string;
  etag?: string;
  lastModified?: string;
  contentLength?: number;
  /** sha256 of bytes on disk after a successful fetch / of a local pack. */
  sha256?: string;
  /** Local file fingerprint: `size:mtimeMs`. */
  localFp?: string;
};

export type ArtifactSourceMeta = RemoteArtifactValidators & {
  version: 1;
  kind: "remote" | "local";
  checkedAt: string;
};

function headerString(
  headers: Record<string, unknown> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== want) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) {
      return value[0].trim();
    }
  }
  return undefined;
}

function headerNumber(
  headers: Record<string, unknown> | undefined,
  name: string,
): number | undefined {
  const raw = headerString(headers, name);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function validatorsFromResponseHeaders(
  url: string,
  headers: Record<string, unknown> | undefined,
): RemoteArtifactValidators {
  const etag = headerString(headers, "etag");
  const lastModified = headerString(headers, "last-modified");
  const contentLength = headerNumber(headers, "content-length");
  return {
    url,
    ...(etag ? { etag } : {}),
    ...(lastModified ? { lastModified } : {}),
    ...(contentLength != null ? { contentLength } : {}),
  };
}

/** True when stored validators prove the remote has not moved. */
export function remoteArtifactUnchanged(
  stored: RemoteArtifactValidators | null | undefined,
  probe: RemoteArtifactValidators | null | undefined,
): boolean {
  if (!stored || !probe) return false;
  if (stored.url && probe.url && stored.url !== probe.url) return false;

  if (stored.etag && probe.etag) {
    return stored.etag === probe.etag;
  }
  if (
    stored.lastModified &&
    probe.lastModified &&
    stored.contentLength != null &&
    probe.contentLength != null
  ) {
    return (
      stored.lastModified === probe.lastModified &&
      stored.contentLength === probe.contentLength
    );
  }
  if (stored.lastModified && probe.lastModified) {
    return stored.lastModified === probe.lastModified;
  }
  if (
    stored.contentLength != null &&
    probe.contentLength != null &&
    stored.sha256 &&
    probe.sha256
  ) {
    return (
      stored.contentLength === probe.contentLength &&
      stored.sha256 === probe.sha256
    );
  }
  return false;
}

export function localFileFingerprint(absPath: string): string | null {
  try {
    if (!existsSync(absPath)) return null;
    const st = statSync(absPath);
    return `${st.size}:${Math.trunc(st.mtimeMs)}`;
  } catch {
    return null;
  }
}

export async function localFileFingerprintAsync(
  absPath: string,
): Promise<string | null> {
  try {
    const st = await fs.stat(absPath);
    return `${st.size}:${Math.trunc(st.mtimeMs)}`;
  } catch {
    return null;
  }
}

export function hashArtifactBytes(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function hashArtifactFile(absPath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(absPath);
    return hashArtifactBytes(buf);
  } catch {
    return null;
  }
}

/**
 * Stable fingerprint of a sorted file list (basename + size + mtime).
 * Cheap DAT-dir / multi-file source identity without hashing contents.
 */
export async function filesListFingerprint(
  files: readonly string[],
): Promise<string> {
  const sorted = [...files].sort((a, b) => a.localeCompare(b, "en"));
  const parts: string[] = [];
  for (const file of sorted) {
    const st = await fs.stat(file);
    parts.push(
      `${path.basename(file)}:${st.size}:${Math.trunc(st.mtimeMs)}`,
    );
  }
  return hashArtifactBytes(parts.join("|"));
}

export function readArtifactSourceMeta(
  metaPath: string,
): ArtifactSourceMeta | null {
  try {
    if (!existsSync(metaPath)) return null;
    const parsed = JSON.parse(
      readFileSync(metaPath, "utf8"),
    ) as ArtifactSourceMeta;
    if (parsed?.version !== 1) return null;
    if (parsed.kind !== "remote" && parsed.kind !== "local") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeArtifactSourceMeta(
  metaPath: string,
  meta: ArtifactSourceMeta,
): void {
  mkdirSync(path.dirname(metaPath), { recursive: true });
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

/** HEAD probe — null when the origin refuses HEAD or the network fails. */
export async function probeRemoteArtifact(
  url: string,
): Promise<RemoteArtifactValidators | null> {
  try {
    const response = await httpHead(url, {
      timeout: 60_000,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    return validatorsFromResponseHeaders(
      url,
      response.headers as Record<string, unknown>,
    );
  } catch {
    return null;
  }
}

export type DownloadIfChangedResult = {
  changed: boolean;
  path: string;
  meta: ArtifactSourceMeta;
};

/**
 * Skip the GET when a prior meta + on-disk file still match a HEAD probe.
 * Falls back to full download when HEAD is unavailable or validators disagree.
 */
export async function downloadRemoteArtifactIfChanged(opts: {
  url: string;
  destPath: string;
  metaPath: string;
  timeoutMs?: number;
  maxContentLength?: number;
}): Promise<DownloadIfChangedResult | null> {
  const prior = readArtifactSourceMeta(opts.metaPath);
  const destExists = existsSync(opts.destPath);

  const probe = await probeRemoteArtifact(opts.url);
  if (
    destExists &&
    prior?.kind === "remote" &&
    remoteArtifactUnchanged(prior, probe ?? { url: opts.url })
  ) {
    return { changed: false, path: opts.destPath, meta: prior };
  }

  await fs.mkdir(path.dirname(opts.destPath), { recursive: true });
  try {
    const headers: Record<string, string> = {};
    if (prior?.etag && destExists) {
      headers["If-None-Match"] = prior.etag;
    } else if (prior?.lastModified && destExists) {
      headers["If-Modified-Since"] = prior.lastModified;
    }

    const response = await httpGet<ArrayBuffer>(opts.url, {
      responseType: "arraybuffer",
      timeout: opts.timeoutMs ?? 10 * 60_000,
      maxContentLength: opts.maxContentLength ?? 512 * 1024 * 1024,
      headers,
      validateStatus: (status) =>
        status === 200 || status === 304 || (status >= 200 && status < 300),
      noDedup: true,
    });

    if (response.status === 304 && destExists && prior?.kind === "remote") {
      const meta: ArtifactSourceMeta = {
        ...prior,
        checkedAt: new Date().toISOString(),
      };
      writeArtifactSourceMeta(opts.metaPath, meta);
      return { changed: false, path: opts.destPath, meta };
    }

    const buf = Buffer.from(response.data);
    await fs.writeFile(opts.destPath, buf);
    const fromHeaders = validatorsFromResponseHeaders(
      opts.url,
      response.headers as Record<string, unknown>,
    );
    const meta: ArtifactSourceMeta = {
      version: 1,
      kind: "remote",
      url: opts.url,
      checkedAt: new Date().toISOString(),
      sha256: hashArtifactBytes(buf),
      localFp: await localFileFingerprintAsync(opts.destPath) ?? undefined,
      ...(fromHeaders.etag ? { etag: fromHeaders.etag } : {}),
      ...(fromHeaders.lastModified
        ? { lastModified: fromHeaders.lastModified }
        : {}),
      contentLength: fromHeaders.contentLength ?? buf.byteLength,
    };
    writeArtifactSourceMeta(opts.metaPath, meta);
    return { changed: true, path: opts.destPath, meta };
  } catch (error) {
    console.warn(`[artifact] Failed to download ${opts.url}`, error);
    return null;
  }
}

/**
 * Local file freshness: compare size:mtime (and optional sha256) to stored meta.
 */
export async function localArtifactUnchanged(
  absPath: string,
  prior: ArtifactSourceMeta | null | undefined,
): Promise<boolean> {
  if (!prior || prior.kind !== "local") return false;
  const fp = await localFileFingerprintAsync(absPath);
  if (!fp || !prior.localFp) return false;
  if (fp !== prior.localFp) return false;
  if (prior.sha256) {
    const hash = await hashArtifactFile(absPath);
    if (!hash || hash !== prior.sha256) return false;
  }
  return true;
}

export async function recordLocalArtifactMeta(opts: {
  absPath: string;
  metaPath: string;
  url?: string;
}): Promise<ArtifactSourceMeta | null> {
  const fp = await localFileFingerprintAsync(opts.absPath);
  if (!fp) return null;
  const sha256 = await hashArtifactFile(opts.absPath);
  const meta: ArtifactSourceMeta = {
    version: 1,
    kind: "local",
    checkedAt: new Date().toISOString(),
    localFp: fp,
    ...(sha256 ? { sha256 } : {}),
    ...(opts.url ? { url: opts.url } : {}),
  };
  writeArtifactSourceMeta(opts.metaPath, meta);
  return meta;
}
