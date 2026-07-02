#!/usr/bin/env npx tsx

export {};

try {
  process.loadEnvFile(".env");
} catch {
  console.warn("(.env not loaded)");
}

type MappingStatus = "ok" | "partial" | "empty" | "blocked" | "error";
type ObservationMode = "enabled" | "migrating" | "legacy" | "unknown";
type MigrationPlanEntry = {
  providerId: string;
  observationMode: ObservationMode;
  status: MappingStatus;
  observationModeReason: string | null;
  reason: string | null;
};

function mappingMark(status: MappingStatus): string {
  switch (status) {
    case "ok":
      return "✅";
    case "partial":
      return "🟡";
    case "empty":
      return "⚪";
    case "blocked":
      return "⛔";
    case "error":
      return "❌";
    default:
      return "•";
  }
}

function observationMark(mode: ObservationMode): string {
  switch (mode) {
    case "enabled":
      return "🟢";
    case "migrating":
      return "🟡";
    case "legacy":
      return "⚪";
    case "unknown":
      return "•";
    default:
      return "•";
  }
}

function printMigrationSection(
  title: string,
  entries: MigrationPlanEntry[],
): void {
  console.log(title);
  if (entries.length === 0) {
    console.log("  - none");
    return;
  }

  for (const [index, entry] of entries.entries()) {
    const reason = entry.observationModeReason || entry.reason || "-";
    console.log(
      `  ${String(index + 1).padStart(2)}. ${entry.providerId.padEnd(16)} mode:${entry.observationMode.padEnd(9)} map:${entry.status.padEnd(7)} ${reason}`,
    );
  }
}

async function main() {
  const { runProviderMappingAudit } = await import(
    "@/services/provider/mappingAudit"
  );
  const payload = await runProviderMappingAudit();

  for (const entry of payload.probes) {
    const mapped = String(entry.mappedKeys.length).padStart(3);
    const unused = String(entry.unusedKeys.length).padStart(3);
    const observations = String(entry.observationCount).padStart(3);
    const kinds =
      entry.observationKinds.length > 0
        ? entry.observationKinds.join(",")
        : "-";
    const schema = entry.observationSchemaVersion || "-";
    const reason = entry.reason ? ` | ${entry.reason}` : "";
    const observationReason = entry.observationModeReason
      ? ` | obs:${entry.observationModeReason}`
      : "";
    const adapter = entry.hasMetadataAdapter ? "adapter" : "no-adapter";
    const probe = entry.hasCustomProbe ? "custom-probe" : "no-custom-probe";

    console.log(
      `${mappingMark(entry.status)} ${entry.providerId.padEnd(16)} map:${entry.status.padEnd(7)} obs:${observationMark(entry.observationMode)} ${entry.observationMode.padEnd(9)} ${adapter} ${probe} mapped:${mapped} unused:${unused} obsCount:${observations} schema:${schema} kinds:${kinds}${reason}${observationReason}`,
    );
  }

  const mappingSummary = payload.probes.reduce(
    (acc, entry) => {
      acc[entry.status] += 1;
      return acc;
    },
    { ok: 0, partial: 0, empty: 0, blocked: 0, error: 0 } as Record<
      MappingStatus,
      number
    >,
  );

  const observationSummary = payload.probes.reduce(
    (acc, entry) => {
      acc[entry.observationMode] += 1;
      return acc;
    },
    {
      enabled: 0,
      migrating: 0,
      legacy: 0,
      unknown: 0,
    } as Record<ObservationMode, number>,
  );

  console.log("");
  console.log(
    [
      `mapping(ok=${mappingSummary.ok}`,
      `partial=${mappingSummary.partial}`,
      `empty=${mappingSummary.empty}`,
      `blocked=${mappingSummary.blocked}`,
      `error=${mappingSummary.error})`,
    ].join(" "),
  );
  console.log(
    [
      `observations(enabled=${observationSummary.enabled}`,
      `migrating=${observationSummary.migrating}`,
      `legacy=${observationSummary.legacy}`,
      `unknown=${observationSummary.unknown})`,
    ].join(" "),
  );
  console.log("");
  printMigrationSection(
    "next migration queue (legacy -> unknown):",
    payload.migrationPlan.next,
  );
  console.log("");
  printMigrationSection(
    "legacy providers with metadata adapter:",
    payload.migrationPlan.legacy,
  );
  console.log("");
  printMigrationSection(
    "unknown providers with metadata adapter:",
    payload.migrationPlan.unknown,
  );
  console.log("");
  printMigrationSection(
    "out-of-scope providers (no metadata adapter):",
    payload.migrationPlan.outOfScope,
  );
  console.log(`generatedAt: ${payload.generatedAt}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
