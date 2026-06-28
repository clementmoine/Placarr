import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOpenLibraryResolver } from "./resolver";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockedGet = vi.mocked(axios.get);

describe("OpenLibrary resolver", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedGet.mockReset();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("retente les erreurs reseau transitoires puis echoue proprement", async () => {
    vi.useFakeTimers();
    mockedGet.mockRejectedValue(
      Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
    );

    const promise = createOpenLibraryResolver()("Super Picsou Geant n°01");
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBeNull();
    expect(mockedGet).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[OpenLibrary] Metadata lookup failed:"),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("utilise un timeout explicite pour eviter les requetes pendues", async () => {
    mockedGet.mockResolvedValueOnce({ data: { docs: [] } });

    await expect(
      createOpenLibraryResolver()("Super Picsou Geant n°01"),
    ).resolves.toBeNull();

    expect(mockedGet).toHaveBeenCalledWith(
      "https://openlibrary.org/search.json?q=Super%20Picsou%20Geant%20n%C2%B001",
      { timeout: 12000 },
    );
  });
});
