import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: { findFirst: vi.fn() },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: h.user },
}));

import {
  canReadOwnedRow,
  collectionUserIdFor,
  getCollectionOwnerId,
} from "./collectionOwner";

beforeEach(() => {
  h.user.findFirst.mockReset();
});

describe("getCollectionOwnerId", () => {
  it("prefers the earliest admin", async () => {
    h.user.findFirst.mockResolvedValueOnce({ id: "admin-1" });
    await expect(getCollectionOwnerId()).resolves.toBe("admin-1");
    expect(h.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: "admin" },
      }),
    );
  });

  it("falls back to a regular user when there is no admin", async () => {
    h.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "user-1" });
    await expect(getCollectionOwnerId()).resolves.toBe("user-1");
  });
});

describe("collectionUserIdFor", () => {
  it("maps guests and anonymous visitors to the collection owner", async () => {
    h.user.findFirst.mockResolvedValue({ id: "admin-1" });
    await expect(
      collectionUserIdFor({ id: "guest-1", role: "guest" }),
    ).resolves.toBe("admin-1");
    await expect(collectionUserIdFor(null)).resolves.toBe("admin-1");
    await expect(
      collectionUserIdFor({ id: "", role: "guest" }),
    ).resolves.toBe("admin-1");
  });

  it("keeps non-guest ids unchanged", async () => {
    await expect(
      collectionUserIdFor({ id: "u1", role: "user" }),
    ).resolves.toBe("u1");
    expect(h.user.findFirst).not.toHaveBeenCalled();
  });
});

describe("canReadOwnedRow", () => {
  it("lets anonymous visitors and guests read the owner's rows only", () => {
    expect(canReadOwnedRow(null, "admin-1", "admin-1")).toBe(true);
    expect(
      canReadOwnedRow({ id: "g", role: "guest" }, "admin-1", "admin-1"),
    ).toBe(true);
    expect(
      canReadOwnedRow({ id: "g", role: "guest" }, "other", "admin-1"),
    ).toBe(false);
  });

  it("lets admins and owners read", () => {
    expect(
      canReadOwnedRow({ id: "a", role: "admin" }, "anyone", "admin-1"),
    ).toBe(true);
    expect(canReadOwnedRow({ id: "u1", role: "user" }, "u1", "admin-1")).toBe(
      true,
    );
  });
});
