export async function retry<T>(
  fn: () => Promise<T>,
  retries = 5,
  delayMs = 300,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 1) throw err;
    console.warn(`Retrying... (${retries - 1} left)`);

    await new Promise((res) => setTimeout(res, delayMs));
    return retry(fn, retries - 1, delayMs * 2); // Backoff exponentiel
  }
}
