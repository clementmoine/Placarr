import { describe, expect, it } from "vitest";

import { PROVIDERS } from "@/services/provider/catalog";

import { REMOTE_IMAGE_PROXY_HOST_FRAGMENTS } from "./remoteImageProxyHosts";

describe("REMOTE_IMAGE_PROXY_HOST_FRAGMENTS", () => {
  it("matches registry providers with remoteImageReferer + coverUrlHost", () => {
    const registryHosts = PROVIDERS.filter(
      (provider) => provider.remoteImageReferer && provider.coverUrlHost,
    )
      .map((provider) => provider.coverUrlHost as string)
      .sort();

    expect([...REMOTE_IMAGE_PROXY_HOST_FRAGMENTS].sort()).toEqual(
      registryHosts,
    );
  });
});
