import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http/httpClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http/httpClient")>();
  return { ...actual, httpGet: vi.fn() };
});

import { httpGet } from "@/lib/http/httpClient";
import {
  mapRebrickableRawSet,
  resolveRebrickableSet,
  searchRebrickableSets,
} from "./fetch";
import { mapRebrickableMetadata, rebrickableModule } from "./index";

const httpGetMock = vi.mocked(httpGet);

const SAMPLE_RAW = {
  set_num: "75192-1",
  name: "Millennium Falcon",
  year: 2017,
  num_parts: 7541,
  set_img_url: "https://cdn.rebrickable.com/media/sets/75192-1.jpg",
  set_url: "https://rebrickable.com/sets/75192-1/",
  theme_id: 158,
};

describe("mapRebrickableRawSet", () => {
  it("maps set_num and image", () => {
    expect(mapRebrickableRawSet(SAMPLE_RAW)).toMatchObject({
      setNum: "75192-1",
      name: "Millennium Falcon",
      numParts: 7541,
      year: 2017,
    });
  });
});

describe("mapRebrickableMetadata", () => {
  it("builds observations with legoSet external id", () => {
    const meta = mapRebrickableMetadata(mapRebrickableRawSet(SAMPLE_RAW));
    expect(meta?.externalIds?.rebrickable).toBe("75192-1");
    expect(meta?.externalIds?.legoSet).toBe("75192-1");
    expect(meta?.observations?.length).toBeGreaterThan(0);
  });
});

describe("rebrickable fetch", () => {
  const saved = process.env.REBRICKABLE_API_KEY;

  beforeEach(() => {
    httpGetMock.mockReset();
    process.env.REBRICKABLE_API_KEY = "test-key";
  });

  afterEach(() => {
    if (saved !== undefined) process.env.REBRICKABLE_API_KEY = saved;
    else delete process.env.REBRICKABLE_API_KEY;
  });

  it("searches and resolves by set number", async () => {
    httpGetMock.mockResolvedValueOnce({
      data: { results: [SAMPLE_RAW] },
    } as never);
    expect(await searchRebrickableSets("Falcon")).toHaveLength(1);

    httpGetMock.mockResolvedValueOnce({ data: SAMPLE_RAW } as never);
    const byNum = await resolveRebrickableSet({ name: "75192-1" });
    expect(byNum?.setNum).toBe("75192-1");
    expect(String(httpGetMock.mock.calls[1]?.[0])).toContain(
      "/lego/sets/75192-1/",
    );
  });
});

describe("rebrickableModule", () => {
  it("declares toys capabilities via defineProvider", () => {
    expect(rebrickableModule.info.id).toBe("rebrickable");
    expect(rebrickableModule.info.types).toEqual(["toys"]);
    expect(rebrickableModule.info.capabilities).toContain("identify");
  });
});
