import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  enqueue: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ user: { id: "u1", role: "admin" } })),
}));
vi.mock("@/lib/http/rateLimit", () => ({
  consumeRateLimit: vi.fn(() => ({ allowed: true })),
}));
vi.mock("@/core/collect/jobs/workQueue", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/core/collect/jobs/workQueue")>();
  return { ...actual, enqueueBackgroundWorkJob: h.enqueue };
});

import { POST } from "./route";

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/catalog-index-sync", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/catalog-index-sync", () => {
  beforeEach(() => {
    h.enqueue.mockReset();
    h.enqueue.mockResolvedValue({ id: "job1" });
  });

  it("ne remplace que la Sync ouverte du même catalogue, pas celles des autres", async () => {
    const response = await POST(
      post({ kind: "catalogProviderSync", providerId: "lorcanatcg" }),
    );

    expect(response.status).toBe(200);
    expect(h.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        replaceOpenForKind: true,
        replaceOpenPayloadMatch: { path: ["providerId"], equals: "lorcanatcg" },
      }),
    );
  });
});
