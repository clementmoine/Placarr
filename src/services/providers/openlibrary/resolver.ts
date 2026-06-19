import axios from "axios";
import levenshtein from "fast-levenshtein";
import { parse, format } from "date-fns";
import { fr, enUS } from "date-fns/locale";

import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";

interface OpenLibraryWork {
  key: string;
  title: string;
  type?: { key?: string };
  authors?: { key: string }[];
  publishers?: string[];
  identifiers?: Record<string, string[]>;
  local_id?: string[];
  source_records?: string[];
  contributions?: string[];
  number_of_pages?: number;
  description?: { value: string } | string;
  publish_date?: string;
  covers?: number[];
  subjects?: string[];
  first_sentence?: { value: string } | string;
  languages?: Array<{ key?: string }>;
  physical_format?: string;
  classifications?: {
    dewey_decimal_class?: string[];
    lc_classifications?: string[];
  };
}

interface OpenLibrarySearchResponse {
  docs?: Array<{
    key: string;
    title: string;
    title_suggest?: string;
    subtitle?: string;
    author_name?: string[];
    author_key?: string[];
    language?: string[];
    edition_count?: number;
    has_fulltext?: boolean;
    first_sentence?: string[];
    publisher?: string[];
    publish_year?: number[];
    publish_date?: string[];
    cover_i?: number;
    cover_edition_key?: string;
    ebook_access?: string;
    ia?: string[];
    ia_collection_s?: string;
    public_scan_b?: boolean;
  }>;
}

interface OpenLibraryAuthor {
  name: string;
  photos?: number[];
}

interface OpenLibraryEditionsResponse {
  entries?: Array<{
    key: string;
    title: string;
    languages?: Array<{ key: string }>;
    publishers?: string[];
    publish_date?: string;
    number_of_pages?: number;
    covers?: number[];
    authors?: Array<{ key: string }>;
    description?: { value: string } | string;
  }>;
}

export function createOpenLibraryResolver() {
  return async function fetchFromOpenLibrary(
    name: string,
    barcode?: string | null,
  ): Promise<MetadataResult | null> {
    const MAX_RETRIES = 3;
    const INITIAL_DELAY = 1000;

    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const fetchWithRetry = async <T>(url: string, retryCount = 0): Promise<T> => {
      try {
        const response = await axios.get<T>(url);
        return response.data;
      } catch (error: unknown) {
        const axiosError = error as { response?: { status: number } };
        if (
          (axiosError.response?.status === 503 ||
            axiosError.response?.status === 500) &&
          retryCount < MAX_RETRIES
        ) {
          const delay = INITIAL_DELAY * Math.pow(2, retryCount);
          console.log(
            `Open Library API request failed with status ${axiosError.response.status}, retrying in ${delay}ms...`,
          );
          await sleep(delay);
          return fetchWithRetry<T>(url, retryCount + 1);
        }
        throw error;
      }
    };

    try {
      let workId: string | null = null;
      let workData: OpenLibraryWork | null = null;

      const yearMatch = name ? name.match(/\((\d{4})\)/) : null;
      const requestedYear = yearMatch ? parseInt(yearMatch[1]) : null;
      const cleanName = name
        ? yearMatch
          ? name.replace(/\(\d{4}\)/, "").trim()
          : name
        : "";

      if (barcode) {
        const isbnData = await fetchWithRetry<
          OpenLibraryWork & { works?: { key: string }[] }
        >(`https://openlibrary.org/isbn/${barcode}.json`);

        if (isbnData && isbnData.works?.[0]?.key) {
          if (!name) {
            workId = isbnData.works[0].key;
            workData = isbnData;
          } else {
            const isbnTitle = (isbnData.title || "").toLowerCase();
            const queryLower = cleanName.toLowerCase();
            const dist = levenshtein.get(isbnTitle, queryLower);
            const maxL = Math.max(isbnTitle.length, queryLower.length);
            const similarity = 1 - dist / maxL;

            if (
              isbnTitle.includes(queryLower) ||
              queryLower.includes(isbnTitle) ||
              similarity > 0.4
            ) {
              workId = isbnData.works[0].key;
              workData = isbnData;
            } else {
              console.warn(
                `[OpenLibrary] Barcode "${barcode}" resolved to title "${isbnData.title}", which does not match query name "${name}". Ignoring ISBN match.`,
              );
            }
          }
        }
      }

      if (!workId) {
        if (!name) return null;
        const searchQuery = barcode ? `${cleanName} isbn:${barcode}` : cleanName;

        const data = await fetchWithRetry<OpenLibrarySearchResponse>(
          `https://openlibrary.org/search.json?q=${encodeURIComponent(searchQuery)}`,
        );

        if (data.docs && data.docs.length > 0) {
          let bestWork = data.docs[0];
          let maxScore = 0;

          for (const doc of data.docs) {
            let score = 0;
            score += (doc.edition_count || 0) * 10;
            if (doc.has_fulltext) score += 50;
            if (doc.cover_i) score += 30;
            if (doc.language?.length) score += doc.language.length * 5;
            if (doc.author_name?.length) score += 20;

            if (requestedYear && doc.publish_year?.length) {
              const hasMatchingYear = doc.publish_year.some(
                (year) => Math.abs(year - requestedYear) <= 1,
              );
              if (hasMatchingYear) score += 100;
            }

            if (score > maxScore) {
              maxScore = score;
              bestWork = doc;
            }
          }

          workId = bestWork.key;

          const editionsData = await fetchWithRetry<OpenLibraryEditionsResponse>(
            `https://openlibrary.org${workId}/editions.json`,
          );

          if (editionsData.entries && editionsData.entries.length > 0) {
            const sortedEditions = editionsData.entries
              .map((edition) => {
                const distance = levenshtein.get(
                  cleanName.toLowerCase(),
                  edition.title.toLowerCase(),
                );

                const fullLanguageKey = edition.languages?.[0]?.key || "";
                const language = fullLanguageKey.includes("/fre")
                  ? "fr"
                  : fullLanguageKey.includes("/eng")
                    ? "en"
                    : fullLanguageKey.includes("/spa")
                      ? "sp"
                      : fullLanguageKey.includes("/ger")
                        ? "ge"
                        : fullLanguageKey.includes("/por")
                          ? "pt"
                          : fullLanguageKey.includes("/ita")
                            ? "it"
                            : "en";

                const languageScore =
                  language === "fr" ? 2 : language === "en" ? 1 : 0;

                const editionYear = edition.publish_date
                  ? parseInt(edition.publish_date.match(/\d{4}/)?.[0] || "0")
                  : 0;
                const yearMatches = requestedYear
                  ? Math.abs(editionYear - requestedYear) <= 1
                  : false;

                return {
                  edition,
                  distance,
                  languageScore,
                  yearMatches,
                };
              })
              .sort((a, b) => {
                if (a.languageScore !== b.languageScore) {
                  return b.languageScore - a.languageScore;
                }
                if (a.yearMatches !== b.yearMatches) {
                  return b.yearMatches ? 1 : -1;
                }
                return a.distance - b.distance;
              });

            workData = sortedEditions[0].edition;
            if ((bestWork as any).alternate_names) {
              (workData as any).alternate_names = (bestWork as any).alternate_names;
            }
          } else {
            workData = await fetchWithRetry<OpenLibraryWork>(
              `https://openlibrary.org${workId}.json`,
            );
            if ((bestWork as any).alternate_names) {
              (workData as any).alternate_names = (bestWork as any).alternate_names;
            }
          }
        }
      }

      if (!workId || !workData) return null;

      const languageCodeToLabel = (value?: string): string | null => {
        const code = String(value || "")
          .toLowerCase()
          .replace(/^.*\//, "");
        if (!code) return null;
        const map: Record<string, string> = {
          fre: "Français",
          fra: "Français",
          eng: "English",
          spa: "Español",
          ger: "Deutsch",
          deu: "Deutsch",
          ita: "Italiano",
          por: "Português",
        };
        return map[code] || code.toUpperCase();
      };

      const authors =
        workData.authors
          ?.map((author: { key: string }) => {
            if (!author?.key) return null;
            return fetchWithRetry<OpenLibraryAuthor>(
              `https://openlibrary.org${author.key}.json`,
            )
              .then((res) => ({
                name: res.name,
                imageUrl: res.photos?.[0]
                  ? `https://covers.openlibrary.org/a/id/${res.photos[0]}-L.jpg`
                  : null,
              }))
              .catch(() => null);
          })
          .filter(Boolean) || [];

      const authorDetails = (await Promise.all(authors)).filter(
        (
          author,
        ): author is {
          name: string;
          imageUrl: string | null;
        } => Boolean(author),
      );

      let formattedDate: string | undefined;
      if (workData.publish_date) {
        try {
          const locales = [
            { locale: fr, format: "d MMMM yyyy" },
            { locale: enUS, format: "MMMM d, yyyy" },
            { locale: enUS, format: "d MMMM yyyy" },
          ];

          for (const { locale, format: dateFormat } of locales) {
            try {
              const date = parse(workData.publish_date, dateFormat, new Date(), {
                locale,
              });
              if (!isNaN(date.getTime())) {
                formattedDate = format(date, "yyyy-MM-dd");
                break;
              }
            } catch {
              continue;
            }
          }
        } catch (error) {
          console.error("Error parsing date:", error);
        }
      }

      const alternateNames = (workData as any).alternate_names || [];
      const aliases = alternateNames.filter(
        (n: string) => n.toLowerCase().trim() !== workData.title.toLowerCase().trim(),
      );

      const facts: MetadataFact[] = [];
      const workKeyForRatings = workId.startsWith("/works/")
        ? workId
        : typeof workData.key === "string" && workData.key.startsWith("/works/")
          ? workData.key
          : null;
      if (workKeyForRatings) {
        try {
          const workSlug = workKeyForRatings.replace(/^\/works\//, "");
          const ratingsData = await fetchWithRetry<{
            summary?: { average?: number | null; count?: number | null };
          }>(`https://openlibrary.org/works/${workSlug}/ratings.json`);
          const average = ratingsData?.summary?.average;
          const count = ratingsData?.summary?.count;
          if (
            typeof average === "number" &&
            average > 0 &&
            typeof count === "number" &&
            count > 0
          ) {
            facts.push({
              kind: "rating",
              label: "OpenLibrary",
              value: `${average.toFixed(1)}/5 (${new Intl.NumberFormat("fr-FR").format(count)} avis)`,
              source: "openlibrary",
              confidence: 0.64,
              priority: 68,
            });
          }
        } catch {
          // Community ratings are optional on Open Library.
        }
      }
      const languages = (workData.languages || [])
        .map((language) => languageCodeToLabel(language?.key))
        .filter((value): value is string => Boolean(value));
      if (languages.length > 0) {
        facts.push({
          kind: "languages",
          label: "Langue",
          value: Array.from(new Set(languages)).join(" • "),
          source: "openlibrary",
          confidence: 0.66,
          priority: 38,
        });
      }
      if (workData.physical_format) {
        facts.push({
          kind: "format",
          label: "Format",
          value: workData.physical_format.trim(),
          source: "openlibrary",
          confidence: 0.65,
          priority: 36,
        });
      }
      const dewey = workData.classifications?.dewey_decimal_class?.[0];
      if (dewey) {
        facts.push({
          kind: "classification",
          label: "Dewey",
          value: dewey,
          source: "openlibrary",
          confidence: 0.62,
          priority: 34,
        });
      }
      if (Array.isArray(workData.subjects) && workData.subjects.length > 0) {
        facts.push({
          kind: "subjects",
          label: "Sujets",
          value: workData.subjects.slice(0, 4).join(" • "),
          source: "openlibrary",
          confidence: 0.6,
          priority: 33,
        });
      }
      const isbn13 = workData.identifiers?.isbn_13?.[0];
      if (isbn13) {
        facts.push({
          kind: "identifier",
          label: "ISBN-13",
          value: isbn13,
          source: "openlibrary",
          confidence: 0.7,
          priority: 40,
        });
      }
      const isbn10 = workData.identifiers?.isbn_10?.[0];
      if (isbn10) {
        facts.push({
          kind: "identifier",
          label: "ISBN-10",
          value: isbn10,
          source: "openlibrary",
          confidence: 0.68,
          priority: 39,
        });
      }
      const discoveredBarcode =
        normalizeProductBarcode(barcode) ||
        normalizeProductBarcode(isbn13) ||
        normalizeProductBarcode(isbn10) ||
        null;
      if (Array.isArray(workData.contributions) && workData.contributions.length > 0) {
        facts.push({
          kind: "writing",
          label: "Contributeurs",
          value: workData.contributions.slice(0, 4).join(" • "),
          source: "openlibrary",
          confidence: 0.58,
          priority: 24,
        });
      }
      if (Array.isArray(workData.source_records) && workData.source_records.length > 0) {
        facts.push({
          kind: "source-record",
          label: "Source records",
          value: workData.source_records.slice(0, 3).join(" • "),
          source: "openlibrary",
          confidence: 0.54,
          priority: 18,
        });
      }
      if (Array.isArray(workData.local_id) && workData.local_id.length > 0) {
        facts.push({
          kind: "identifier",
          label: "Local IDs",
          value: workData.local_id.slice(0, 3).join(" • "),
          source: "openlibrary",
          confidence: 0.52,
          priority: 17,
        });
      }
      if (workData.type?.key) {
        facts.push({
          kind: "content-type",
          label: "Type OpenLibrary",
          value: workData.type.key.replace(/^.*\//, ""),
          source: "openlibrary",
          confidence: 0.5,
          priority: 14,
        });
      }
      if (workData.key) {
        facts.push({
          kind: "source-url",
          label: "OpenLibrary",
          value: `https://openlibrary.org${workData.key}`,
          url: `https://openlibrary.org${workData.key}`,
          source: "openlibrary",
          confidence: 0.65,
          priority: 22,
        });
      }

      const firstSentence =
        typeof workData.first_sentence === "string"
          ? workData.first_sentence
          : workData.first_sentence?.value;

      return {
        title: workData.title,
        barcode: discoveredBarcode,
        authors: authorDetails,
        publishers:
          workData.publishers?.map((publisher: string) => ({
            name: publisher,
          })) || [],
        pageCount: workData.number_of_pages,
        description:
          typeof workData.description === "string"
            ? workData.description
            : workData.description?.value || firstSentence || undefined,
        releaseDate: formattedDate,
        imageUrl: workData.covers?.[0]
          ? `https://covers.openlibrary.org/b/id/${workData.covers[0]}-L.jpg`
          : undefined,
        attachments: [
          ...(workData.covers?.[0]
            ? [
                {
                  type: "cover" as const,
                  url: `https://covers.openlibrary.org/b/id/${workData.covers[0]}-L.jpg`,
                  source: "openlibrary",
                },
              ]
            : []),
          ...(workData.covers?.slice(1).map((coverId: number) => ({
            type: "cover" as const,
            url: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`,
            source: "openlibrary",
          })) || []),
        ],
        aliases,
        facts: facts.length > 0 ? facts : undefined,
      };
    } catch (error) {
      console.error("Error fetching from Open Library:", error);
      return null;
    }
  };
}
