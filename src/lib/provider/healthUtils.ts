import axios from "axios";

import type {
  ProviderHealthCheck,
  ProviderHealthStatus,
} from "@/types/providerModule";

async function fetchWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 4000,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export async function pingUrl(
  url: string,
  options: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    await axios({
      url,
      method: "GET",
      timeout: 5000,
      validateStatus: () => true,
      ...options,
    });
    return true;
  } catch {
    return false;
  }
}

export function createMetadataHealthCheck(
  providerId: string,
  name: string,
  runCheck: () => Promise<{
    configured?: boolean;
    ok: boolean;
    latency: number | null;
    error?: string | null;
  }>,
): ProviderHealthCheck {
  return {
    providerId,
    async run(): Promise<ProviderHealthStatus> {
      try {
        const result = await runCheck();
        return {
          name,
          type: "metadata",
          configured: result.configured ?? true,
          status: result.ok ? "up" : "down",
          latency: result.latency,
          error: result.error ?? (result.ok ? null : "Host unreachable"),
          credits: null,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Health check failed";
        return {
          name,
          type: "metadata",
          configured: true,
          status: "down",
          latency: null,
          error: message,
          credits: null,
        };
      }
    },
  };
}

export function createUnconfiguredHealthCheck(
  providerId: string,
  name: string,
  error: string,
): ProviderHealthCheck {
  return {
    providerId,
    async run() {
      return {
        name,
        type: "metadata",
        configured: false,
        status: "unconfigured",
        latency: null,
        error,
        credits: null,
      };
    },
  };
}

export function createKeyHealthCheck(
  providerId: string,
  name: string,
  envKeys: string[],
  buildUrl: (key: string) => string,
  missingError = "API key missing",
): ProviderHealthCheck {
  const key = envKeys
    .map((envKey) => process.env[envKey]?.trim())
    .find(Boolean);
  if (!key) {
    return createUnconfiguredHealthCheck(providerId, name, missingError);
  }
  return createMetadataHealthCheck(providerId, name, async () => {
    const start = Date.now();
    const isUp = await pingUrl(buildUrl(key));
    return {
      configured: true,
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable or invalid key",
    };
  });
}

export { fetchWithTimeout };
