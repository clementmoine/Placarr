export type ProviderProductUrlRef = {
  providerKey: string;
  url: string;
};

export function providerProductUrlsForKey(
  providerKey: string,
  refs: readonly ProviderProductUrlRef[] | undefined,
): string[] {
  return (refs ?? [])
    .filter((entry) => entry.providerKey === providerKey)
    .map((entry) => entry.url);
}
