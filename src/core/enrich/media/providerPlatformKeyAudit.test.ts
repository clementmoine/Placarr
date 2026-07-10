import { describe, expect, it } from "vitest";

import { buildLaunchBoxAttachments } from "@/providers/launchbox/images";
import { withMetadataPlatformKeys } from "@/core/enrich/media/platformKeyStamp";

describe("provider platformKey stamping", () => {
  it("stamps LaunchBox attachments from metadata.platformKey", () => {
    const attachments = buildLaunchBoxAttachments([
      {
        fileName: "Images/Box/Front/NA.jpg",
        type: "Box - Front",
        region: "North America",
      },
    ]);

    const metadata = withMetadataPlatformKeys(
      {
        title: "Game",
        platformKey: "psvita",
        attachments,
      },
      "psvita",
    );

    expect(metadata.attachments?.[0]?.platformKey).toBe("psvita");
  });

  it("keeps ScreenScraper-style explicit attachment keys when already set", () => {
    const metadata = withMetadataPlatformKeys(
      {
        title: "Game",
        platformKey: "psvita",
        attachments: [
          {
            type: "cover",
            url: "https://example.com/3d.jpg",
            source: "screenscraper",
            role: "3d-us",
            platformKey: "psvita",
          },
          {
            type: "cover",
            url: "https://example.com/2d.jpg",
            source: "screenscraper",
            role: "us",
          },
        ],
      },
      "psvita",
    );

    expect(metadata.attachments?.map((attachment) => attachment.platformKey)).toEqual(
      ["psvita", "psvita"],
    );
  });
});
