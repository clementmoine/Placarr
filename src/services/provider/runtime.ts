import { PROVIDER_MODULES } from "@/services/provider/registry";

export type {
  ProviderHealthCheck,
  ProviderHealthStatus,
  TestProviderHandler,
  TestProviderHandlerKind,
  TestProviderFormatContext,
} from "@/types/providerModule";

export const providerHealthChecks = PROVIDER_MODULES.flatMap((module) =>
  module.healthCheck ? [module.healthCheck] : [],
);

export const testProviderHandlers = Object.fromEntries(
  PROVIDER_MODULES.flatMap((module) =>
    Object.entries(module.testHandlers ?? {}),
  ),
) as Record<string, import("@/types/providerModule").TestProviderHandler>;
