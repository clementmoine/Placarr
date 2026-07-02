#!/usr/bin/env npx tsx
/** One-off: run every provider module's healthCheck and report up/down. */

export {};

try {
  process.loadEnvFile(".env");
} catch {
  console.warn("(.env not loaded)");
}

async function main() {
  // Keep the registry import after loadEnvFile so provider modules that still
  // derive import-time configuration see the same environment as the app.
  const { PROVIDER_MODULES } = await import("@/services/provider/registry");
  const mods = PROVIDER_MODULES.filter((m) => m.healthCheck);
  const results = await Promise.all(
    mods.map(async (m) => {
      const id = m.info.id;
      const started = Date.now();
      try {
        const r: any = await m.healthCheck!.run();
        const status = r.status ?? (r.ok ? "up" : "down");
        return {
          id,
          status,
          latency: r.latency ?? Date.now() - started,
          error: r.error ?? null,
        };
      } catch (e: any) {
        return {
          id,
          status: "down",
          latency: Date.now() - started,
          error: e?.message || String(e),
        };
      }
    }),
  );

  results.sort((a, b) =>
    a.status === b.status ? 0 : a.status === "up" ? 1 : -1,
  );
  for (const r of results) {
    const mark = r.status === "up" ? "✅" : "❌";
    console.log(
      `${mark} ${r.id.padEnd(16)} ${String(r.status).padEnd(5)} ${String(r.latency ?? "").padStart(6)}ms  ${r.error ?? ""}`,
    );
  }
  const down = results.filter((r) => r.status !== "up");
  console.log(
    `\n${results.length} providers with health-check, ${down.length} DOWN: ${down.map((d) => d.id).join(", ") || "none"}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
