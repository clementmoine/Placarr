export type CatalogEstimateObservationDisplay = {
  catalogEstimateMinCents?: number | null;
  catalogEstimateMaxCents?: number | null;
  catalogEstimateDisplayValue?: string | null;
};

/** Client-safe formatter for catalog estimate observations stamped on price cards. */
export function formatCatalogEstimateObservationRange(
  observation: CatalogEstimateObservationDisplay,
  locale: string,
): string | null {
  if (
    observation.catalogEstimateMinCents != null &&
    observation.catalogEstimateMaxCents != null
  ) {
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits:
        observation.catalogEstimateMinCents % 100 === 0 ? 0 : 2,
    });
    const min = formatter.format(observation.catalogEstimateMinCents / 100);
    const max = formatter.format(observation.catalogEstimateMaxCents / 100);
    return `${min}–${max}`;
  }

  return observation.catalogEstimateDisplayValue?.trim() || null;
}
