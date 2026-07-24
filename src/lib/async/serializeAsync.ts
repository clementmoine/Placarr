/** Serializes async work so only one caller runs at a time. */
export function createSerializeAsync() {
  let chain: Promise<unknown> = Promise.resolve();

  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const next = chain.then(fn, fn);
      chain = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}
