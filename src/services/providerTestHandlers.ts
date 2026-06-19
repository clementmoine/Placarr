import { PROVIDER_MODULES } from "@/services/providerRegistry";

import type { TestProviderHandler } from "@/types/providerModule";

export type {
  TestProviderHandler,
  TestProviderHandlerKind,
} from "@/types/providerModule";

export const testProviderHandlers = Object.fromEntries(
  PROVIDER_MODULES.flatMap((module) =>
    Object.entries(module.testHandlers ?? {}),
  ),
) as Record<string, TestProviderHandler>;
