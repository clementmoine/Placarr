import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { refetchItemQueries } from "./queryCache";

describe("refetchItemQueries", () => {
  it("invalidates and refetches shelf item and legacy item queries", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const refetchSpy = vi.spyOn(queryClient, "refetchQueries");

    await refetchItemQueries(queryClient, "item-1", ["shelf-1"]);

    expect(invalidateSpy).toHaveBeenCalled();
    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: ["item", "item-1"] });
    expect(refetchSpy).toHaveBeenCalledWith({
      queryKey: ["shelf", "shelf-1", "items", "item-1"],
    });
  });
});
