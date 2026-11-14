import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * q8 vs fp32 on the shipped Lorcana FR gallery (150 degraded queries,
 * printKey-collapsed, sure = ≤230 & margin ≥70):
 *   sure-FP  0 → 0
 *   sure-TP  117 → 116   (lorcana:10-8, q8 margin 66 vs 70 → honest doubt)
 *   R@1      87.3% → 89.3%  (reprint twins, margin ~0)
 * Cosine min 0.963 is not a retrieval metric — ExecuTorch withdrew their
 * DINOv2-S int8 after judging it on cosine (63% of the decision budget
 * spent). WASM fp32 is slower and can OOM. Keep the split.
 */
describe("client DINOv2 dtype split", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/client/scan/cardEmbed.client.ts"),
    "utf8",
  );

  it("WebGPU is fp32 (index parity), WASM is q8 (measured: 0 sure-FP)", () => {
    expect(src).toMatch(/device === "webgpu" \? "fp32" : "q8"/);
  });
});
