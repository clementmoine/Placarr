import { PROVIDER_MODULES } from "@/services/providerRegistry";

export type {
  ProviderHealthCheck,
  ProviderHealthStatus,
} from "@/types/providerModule";

export const providerHealthChecks = PROVIDER_MODULES.flatMap((module) =>
  module.healthCheck ? [module.healthCheck] : [],
);
