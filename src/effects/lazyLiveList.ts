/**
 * Live read-only view over a lazily-computed name list — empty until the foil
 * meta hydrates (browser) or the server reader installs itself. Prefer the
 * underlying `list*` function in new code; the view exists for call sites that
 * captured the array before hydrate.
 */
export function lazyLiveList(list: () => string[]): readonly string[] {
  return new Proxy([] as string[], {
    get(_target, prop) {
      const names = list();
      const value = Reflect.get(names, prop, names);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(names)
        : value;
    },
  });
}
