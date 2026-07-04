/**
 * Audit remote image hostnames from DB + caches against next.config patterns.
 * Usage: pnpm tsx scripts/auditImageHosts.ts
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { prisma } from "@/lib/db/prisma";
import {
  isNextImageRemoteHostAllowed,
  looksLikeRemoteImageUrl,
  nextImageRemotePatternCount,
} from "@/lib/media/nextImageRemoteHosts";

const URL_RE = /https?:\/\/[^\s"'<>\\]+/gi;

type HostHit = { host: string; source: string; sample: string };

function collectUrl(
  value: string | null | undefined,
  source: string,
  hits: Map<string, HostHit>,
) {
  if (!value?.trim()) return;
  const trimmed = value.trim();
  if (!looksLikeRemoteImageUrl(trimmed)) return;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    if (!hits.has(host)) {
      hits.set(host, { host, source, sample: trimmed.slice(0, 120) });
    }
  } catch {
    // ignore invalid URLs
  }
}

function collectUrlsFromText(
  text: string,
  source: string,
  hits: Map<string, HostHit>,
) {
  for (const match of text.matchAll(URL_RE)) {
    collectUrl(match[0], source, hits);
  }
}

function scanSqliteFile(
  filePath: string,
  label: string,
  hits: Map<string, HostHit>,
) {
  if (!fs.existsSync(filePath)) return;
  const db = new DatabaseSync(filePath, { readOnly: true });
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as Array<{ name: string }>;

  for (const { name } of tables) {
    const columns = db.prepare(`PRAGMA table_info(${name})`).all() as Array<{
      name: string;
      type: string;
    }>;
    const textColumns = columns
      .filter((column) => /char|text|blob|json/i.test(column.type))
      .map((column) => column.name);
    if (textColumns.length === 0) continue;

    const rows = db.prepare(`SELECT * FROM ${name} LIMIT 5000`).all() as Array<
      Record<string, unknown>
    >;
    for (const row of rows) {
      for (const column of textColumns) {
        const value = row[column];
        if (typeof value === "string") {
          collectUrlsFromText(value, `${label}:${name}.${column}`, hits);
        }
      }
    }
  }
  db.close();
}

async function main() {
  const hits = new Map<string, HostHit>();

  const items = await prisma.item.findMany({
    select: {
      imageUrl: true,
      backgroundImageUrl: true,
      metadata: {
        select: {
          imageUrl: true,
          heroImageUrl: true,
          attachments: { select: { url: true } },
        },
      },
    },
  });
  for (const item of items) {
    collectUrl(item.imageUrl, "db:item.imageUrl", hits);
    collectUrl(item.backgroundImageUrl, "db:item.backgroundImageUrl", hits);
    collectUrl(item.metadata?.imageUrl, "db:metadata.imageUrl", hits);
    collectUrl(item.metadata?.heroImageUrl, "db:metadata.heroImageUrl", hits);
    for (const attachment of item.metadata?.attachments ?? []) {
      collectUrl(attachment.url, "db:attachment.url", hits);
    }
  }

  const settings = await prisma.setting.findMany({
    where: { key: { startsWith: "screenscraper:" } },
    select: { key: true, value: true },
  });
  for (const setting of settings) {
    if (setting.value) {
      collectUrlsFromText(setting.value, `db:setting:${setting.key}`, hits);
    }
  }

  const cacheRoot = path.join(process.cwd(), ".cache");
  if (fs.existsSync(cacheRoot)) {
    for (const entry of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(cacheRoot, entry.name);
      for (const file of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, file);
        if (file.endsWith(".sqlite")) {
          scanSqliteFile(fullPath, `.cache/${entry.name}/${file}`, hits);
        }
      }
    }
  }

  const remoteHosts = [...hits.values()].sort((a, b) =>
    a.host.localeCompare(b.host),
  );
  const missing = remoteHosts.filter(
    (hit) => !isNextImageRemoteHostAllowed(hit.host),
  );
  const configured = remoteHosts.filter((hit) =>
    isNextImageRemoteHostAllowed(hit.host),
  );

  console.log(
    JSON.stringify(
      {
        totals: {
          uniqueHosts: remoteHosts.length,
          configured: configured.length,
          missing: missing.length,
          patternCount: nextImageRemotePatternCount(),
          patternLimit: 50,
        },
        missing,
        configured,
      },
      null,
      2,
    ),
  );

  if (missing.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
