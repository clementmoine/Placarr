import { describe, expect, it } from "vitest";

import {
  presenceEventChildCount,
  presenceEventKindLabelKey,
  presenceEventReasonLabelKey,
} from "./presenceTimeline";

describe("presenceTimeline", () => {
  it("maps known kinds and reasons to i18n keys", () => {
    expect(presenceEventKindLabelKey("opened")).toBe(
      "items.timeline.kind.opened",
    );
    expect(presenceEventKindLabelKey("weird")).toBe(
      "items.timeline.kind.unknown",
    );
    expect(presenceEventReasonLabelKey("expected")).toBe(
      "items.timeline.reason.expected",
    );
    expect(presenceEventReasonLabelKey("consumed")).toBe(
      "items.timeline.reason.consumed",
    );
    expect(presenceEventReasonLabelKey(null)).toBeNull();
  });

  it("reads childCount from snapshots", () => {
    expect(presenceEventChildCount({ childCount: 8 })).toBe(8);
    expect(presenceEventChildCount({ childCount: -1 })).toBeNull();
    expect(presenceEventChildCount(null)).toBeNull();
  });
});
