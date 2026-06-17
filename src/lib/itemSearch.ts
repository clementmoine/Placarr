import type { Prisma } from "@prisma/client";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function buildTokenVariants(token: string): string[] {
  const variants = new Set<string>();
  const cleaned = token.trim();
  if (!cleaned) return [];

  variants.add(cleaned);

  const lower = cleaned.toLowerCase();
  if (lower.endsWith("ings") && cleaned.length > 5) {
    variants.add(cleaned.slice(0, -1));
  }
  if (lower.endsWith("s") && cleaned.length > 4) {
    variants.add(cleaned.slice(0, -1));
  }
  if (lower.endsWith("ts") && cleaned.length > 4) {
    variants.add(`${cleaned.slice(0, -2)}ds`);
  }
  if (lower.endsWith("ds") && cleaned.length > 4) {
    variants.add(`${cleaned.slice(0, -2)}ts`);
  }
  if (lower === "cretins") {
    variants.add("crétins");
  }
  if (lower === "cretin") {
    variants.add("crétin");
  }

  return Array.from(variants);
}

function buildPhraseVariants(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const normalizedSpacing = trimmed.replace(/\s+/g, " ");
  const tokens = normalizedSpacing.split(" ").filter(Boolean);
  const phrases = new Set<string>([normalizedSpacing]);

  if (tokens.length > 0 && tokens.length <= 4) {
    const tokenVariants = tokens.map(buildTokenVariants);
    let combinations = [""];

    for (const variants of tokenVariants) {
      combinations = combinations
        .flatMap((prefix) =>
          variants.map((variant) =>
            prefix ? `${prefix} ${variant}` : variant,
          ),
        )
        .slice(0, 24);
    }

    combinations.forEach((phrase) => phrases.add(phrase));
  }

  const cleanBarcode = normalizedSpacing.replace(/[^\d]/g, "");
  if (cleanBarcode.length >= 8) {
    phrases.add(cleanBarcode);
  }

  return unique(Array.from(phrases));
}

export function buildItemSearchConditions(
  searchTerm: string,
): Prisma.ItemWhereInput[] {
  return buildPhraseVariants(searchTerm).flatMap((term) => [
    { name: { contains: term } },
    { description: { contains: term } },
    { barcode: { contains: term } },
    { metadata: { is: { title: { contains: term } } } },
    { metadata: { is: { sourceQuery: { contains: term } } } },
    { metadata: { is: { aliases: { contains: term } } } },
  ]);
}
