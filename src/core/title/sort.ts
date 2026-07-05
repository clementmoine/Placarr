export function moveTrailingSortArticleToFront(value: string): string {
  return value
    .replace(/^(.+?),\s*(the|an|a)\s*$/i, (_match, title, article) => {
      const normalizedArticle =
        article.toLowerCase() === "the"
          ? "The"
          : article.toLowerCase() === "an"
            ? "An"
            : "A";
      return `${normalizedArticle} ${title}`.trim();
    })
    .trim();
}

export function getTitleSortKey(value: string): string {
  const displayTitle = moveTrailingSortArticleToFront(value).trim();
  const sortKey = displayTitle
    .replace(/^(?:the|an|a)\s+/i, "")
    .replace(/^(?:le|la|les|un|une|des)\s+/i, "")
    .replace(/^l[’']\s*/i, "")
    .trim();

  return sortKey || displayTitle;
}

export function compareTitlesForSort(
  left: string,
  right: string,
  direction: "asc" | "desc" = "asc",
): number {
  const multiplier = direction === "desc" ? -1 : 1;
  const sortKeyComparison = getTitleSortKey(left).localeCompare(
    getTitleSortKey(right),
    "fr",
    { numeric: true, sensitivity: "base" },
  );
  if (sortKeyComparison !== 0) return sortKeyComparison * multiplier;

  return (
    left.localeCompare(right, "fr", { numeric: true, sensitivity: "base" }) *
    multiplier
  );
}
