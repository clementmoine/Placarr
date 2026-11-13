/**
 * Soft densify retry — transient network/5xx are re-attempted; definitive
 * failures (4xx, empty body) and exhausted attempts resolve to `null` so Sync
 * can skip a face without killing the whole job.
 */
import { isRetryableError, retry } from "@/lib/http/retry";

export async function softRetryNull<T>(
  fn: () => Promise<T | null>,
  retries = 3,
  delayMs = 400,
): Promise<T | null> {
  try {
    return await retry(
      async () => {
        try {
          return await fn();
        } catch (err) {
          if (isRetryableError(err)) throw err;
          return null;
        }
      },
      retries,
      delayMs,
    );
  } catch {
    return null;
  }
}
