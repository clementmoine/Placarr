import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  authReturn: { user: { id: "u1", role: "user" } } as unknown,
  listBackgroundJobsForUser: vi.fn(),
  cancelAllBackgroundJobsForUser: vi.fn(),
  cancelBackgroundJobForUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireGuestOrHigher: vi.fn(async () => h.authReturn),
}));
vi.mock("@/lib/jobs/backgroundJobs", () => ({
  listBackgroundJobsForUser: h.listBackgroundJobsForUser,
  cancelAllBackgroundJobsForUser: h.cancelAllBackgroundJobsForUser,
  cancelBackgroundJobForUser: h.cancelBackgroundJobForUser,
}));

import { DELETE, GET } from "./route";
import { DELETE as DELETE_ONE } from "./[itemId]/route";

describe("GET /api/background-jobs", () => {
  beforeEach(() => {
    h.authReturn = { user: { id: "u1", role: "user" } } as unknown;
    h.listBackgroundJobsForUser.mockReset();
    h.listBackgroundJobsForUser.mockResolvedValue([
      {
        id: "i1",
        name: "Alan Wake II",
        slug: "alan-wake-ii",
        kind: "metadataRefresh",
        startedAt: new Date("2026-06-27T12:00:00.000Z"),
        cancellable: true,
        shelf: {
          id: "s1",
          name: "PlayStation 5",
          slug: "playstation-5",
          type: "games",
        },
      },
    ]);
  });

  it("lists active jobs for the signed-in user", async () => {
    const res = await GET(new NextRequest("http://localhost/api/background-jobs"));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.count).toBe(1);
    expect(h.listBackgroundJobsForUser).toHaveBeenCalledWith("u1");
  });

  it("returns empty list for guests", async () => {
    h.authReturn = { user: { id: "g1", role: "guest" } } as unknown;

    const res = await GET(new NextRequest("http://localhost/api/background-jobs"));
    const payload = await res.json();

    expect(payload).toEqual({ jobs: [], count: 0 });
    expect(h.listBackgroundJobsForUser).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/background-jobs", () => {
  beforeEach(() => {
    h.authReturn = { user: { id: "u1", role: "user" } } as unknown;
    h.cancelAllBackgroundJobsForUser.mockReset();
    h.cancelAllBackgroundJobsForUser.mockResolvedValue(3);
  });

  it("cancels all jobs for the user", async () => {
    const res = await DELETE(new NextRequest("http://localhost/api/background-jobs", { method: "DELETE" }));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.cancelled).toBe(3);
  });

  it("blocks guests", async () => {
    h.authReturn = { user: { id: "g1", role: "guest" } } as unknown;

    const res = await DELETE(new NextRequest("http://localhost/api/background-jobs", { method: "DELETE" }));

    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/background-jobs/[itemId]", () => {
  beforeEach(() => {
    h.authReturn = { user: { id: "u1", role: "user" } } as unknown;
    h.cancelBackgroundJobForUser.mockReset();
    h.cancelBackgroundJobForUser.mockResolvedValue(true);
  });

  it("cancels one job", async () => {
    const res = await DELETE_ONE(
      new NextRequest("http://localhost/api/background-jobs/i1", { method: "DELETE" }),
      { params: Promise.resolve({ itemId: "i1" }) },
    );

    expect(res.status).toBe(200);
    expect(h.cancelBackgroundJobForUser).toHaveBeenCalledWith("u1", "i1");
  });

  it("returns auth response directly", async () => {
    h.authReturn = NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const res = await DELETE_ONE(
      new NextRequest("http://localhost/api/background-jobs/i1", { method: "DELETE" }),
      { params: Promise.resolve({ itemId: "i1" }) },
    );

    expect(res.status).toBe(401);
  });
});
