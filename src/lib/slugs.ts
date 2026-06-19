export function slugify(value?: string | null): string {
  if (!value) return "";

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function shelfPath(shelf: {
  id: string;
  name?: string | null;
  slug?: string | null;
}): string {
  return `/shelves/${shelf.slug || slugify(shelf.name) || shelf.id}`;
}

export function itemPath(
  shelf: { id: string; name?: string | null; slug?: string | null },
  item: { id: string; name?: string | null; slug?: string | null },
): string {
  return `${shelfPath(shelf)}/${item.slug || slugify(item.name) || item.id}`;
}
