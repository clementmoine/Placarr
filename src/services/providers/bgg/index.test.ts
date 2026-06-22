import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  axios: Object.assign(vi.fn(), { get: vi.fn() }),
}));

vi.mock("axios", () => ({ default: h.axios }));
vi.mock("simple-xml-to-json", () => ({ convertXML: vi.fn() }));

import { bggModule } from "./index";

const SAVED_TOKEN = process.env.BGG_API_TOKEN;

afterEach(() => {
  if (SAVED_TOKEN !== undefined) process.env.BGG_API_TOKEN = SAVED_TOKEN;
  else delete process.env.BGG_API_TOKEN;
  h.axios.mockReset();
  h.axios.get.mockReset();
});

describe("bggModule healthCheck", () => {
  it("reads BGG_API_TOKEN when the health check runs", async () => {
    delete process.env.BGG_API_TOKEN;

    await expect(bggModule.healthCheck?.run()).resolves.toMatchObject({
      configured: false,
      status: "unconfigured",
      error: "BGG_API_TOKEN missing",
    });
    expect(h.axios).not.toHaveBeenCalled();

    process.env.BGG_API_TOKEN = "late-token";
    h.axios.mockResolvedValue({ data: "<items />" });

    await expect(bggModule.healthCheck?.run()).resolves.toMatchObject({
      configured: true,
      status: "up",
      error: null,
    });
    expect(h.axios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { Authorization: "Bearer late-token" },
      }),
    );
  });
});
