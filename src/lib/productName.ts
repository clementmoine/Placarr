import levenshtein from "fast-levenshtein";

/**
 * Extracts a clean product name from an array of raw product names using string similarity
 * @param rawNames An array of raw product names
 * @returns The cleaned product name
 */
export function extractProductName(rawNames: string[]): string {
  const validNames = rawNames?.filter(Boolean) || [];
  if (validNames.length === 0) {
    return "";
  }

  // If there's only one name, perform basic cleaning
  if (validNames.length === 1) {
    return cleanSingleName(validNames[0]);
  }

  // Normalize all names (lowercase, trim, remove special characters)
  const normalizedNames = validNames.map((name) => {
    let normalized = name.toLowerCase();
    normalized = normalized.replace(/\s+/g, " ");

    return normalized.trim();
  });

  // Create a frequency map of words
  const wordFrequency: Record<string, number> = {};
  normalizedNames.forEach((name) => {
    const words = name.split(/\s+/);
    words.forEach((word) => {
      if (word.length > 1) {
        // Ignore single-letter words
        wordFrequency[word] = (wordFrequency[word] || 0) + 1;
      }
    });
  });

  // Find common segments using Levenshtein distance
  let bestMatch = "";
  let highestScore = 0;

  // Compare each name with all others to find the most similar segment
  for (let i = 0; i < normalizedNames.length; i++) {
    const segments = extractMeaningfulSegments(normalizedNames[i]);

    for (const segment of segments) {
      if (segment.length < 5) continue; // Skip very short segments

      let segmentScore = 0;

      // Calculate similarity score against all other names
      for (let j = 0; j < normalizedNames.length; j++) {
        if (i !== j) {
          const similarity = calculateSimilarityScore(
            segment,
            normalizedNames[j],
          );
          segmentScore += similarity;
        }
      }

      // Weight the score by the frequency of words
      const words = segment.split(/\s+/);
      let frequencyWeight = 0;
      words.forEach((word) => {
        if (word.length > 1) {
          frequencyWeight += wordFrequency[word] || 0;
        }
      });

      const finalScore = segmentScore * (frequencyWeight / words.length);

      if (finalScore > highestScore) {
        highestScore = finalScore;
        bestMatch = segment;
      }
    }
  }

  // If no good match was found, fall back to the most frequent words
  if (!bestMatch) {
    const sortedWords = Object.entries(wordFrequency)
      .sort((a, b) => b[1] - a[1])
      .filter(([word]) => word.length > 2) // Filter out short words
      .map(([word]) => word);

    bestMatch = sortedWords.slice(0, 4).join(" ");
  }

  // Capitalize the result properly using casing information from raw names
  return capitalizeProductName(bestMatch, validNames);
}

/**
 * Extracts meaningful segments from a string by breaking at common separators
 * @param text The text to extract segments from
 * @returns An array of segments
 */
function extractMeaningfulSegments(text: string): string[] {
  // Break the text at common separators
  const segments: string[] = [];

  // First try to extract segments based on common separators
  const separatorSegments = text.split(/[-–—:()]/);

  for (const segment of separatorSegments) {
    const trimmed = segment.trim();
    if (trimmed.length > 0) {
      segments.push(trimmed);

      // Also include multi-word combinations
      const words = trimmed.split(/\s+/);
      if (words.length > 2) {
        for (let i = 0; i < words.length - 1; i++) {
          for (let j = i + 1; j < words.length + 1; j++) {
            const subSegment = words.slice(i, j).join(" ");
            if (subSegment.length > 5 && !segments.includes(subSegment)) {
              segments.push(subSegment);
            }
          }
        }
      }
    }
  }

  // Also include the entire string
  segments.push(text);

  return segments;
}

/**
 * Calculates the similarity between a segment and a text using modified Levenshtein approach
 * @param segment The segment to check
 * @param text The text to compare against
 * @returns A similarity score
 */
function calculateSimilarityScore(segment: string, text: string): number {
  // Check if the segment is contained in the text
  if (text.includes(segment)) {
    return segment.length; // Return length as score for exact matches
  }

  // Calculate Levenshtein distance
  const distance = levenshtein.get(segment, text);
  const maxLength = Math.max(segment.length, text.length);

  // Convert distance to similarity score (higher is better)
  return maxLength - distance;
}

/**
 * Cleans a single product name by removing common prefixes/suffixes and noise
 * @param name The raw product name
 * @returns The cleaned product name
 */
function cleanSingleName(name: string): string {
  const cleaned = name.replace(/\s+/g, " ");

  return capitalizeProductName(cleaned.trim(), [name]);
}

/**
 * Properly capitalizes a product name based on most frequent casing in raw names
 * @param name The product name to capitalize
 * @param rawNames Original raw product names array
 * @returns The properly capitalized product name
 */
function capitalizeProductName(name: string, rawNames: string[] = []): string {
  // Split into words
  const words = name.split(" ");

  // List of words that shouldn't be capitalized (unless they're the first word)
  const lowercaseWords = [
    "a",
    "an",
    "the",
    "and",
    "but",
    "or",
    "for",
    "nor",
    "on",
    "at",
    "to",
    "from",
    "by",
    "de",
    "la",
    "le",
    "au",
  ];

  // Create a map of word casing frequencies from raw names
  const wordCasingMap: Record<string, Record<string, number>> = {};

  if (rawNames && rawNames.length > 0) {
    // Process all raw names to build the casing frequency map
    rawNames.forEach((rawName) => {
      const rawWords = rawName.split(/[\s\-():]+/);
      rawWords.forEach((rawWord) => {
        if (!rawWord || rawWord.length <= 1) return;

        const lowerWord = rawWord.toLowerCase();
        if (!wordCasingMap[lowerWord]) {
          wordCasingMap[lowerWord] = {};
        }

        // Track this specific casing
        if (!wordCasingMap[lowerWord][rawWord]) {
          wordCasingMap[lowerWord][rawWord] = 0;
        }
        wordCasingMap[lowerWord][rawWord]++;
      });
    });
  }

  // Capitalize each word appropriately
  const capitalizedWords = words.map((word, index) => {
    // Skip empty strings
    if (!word) return "";

    const lowerWord = word.toLowerCase();

    // Check if we have casing information
    if (wordCasingMap[lowerWord]) {
      // Find the most frequent casing for this word
      let mostFrequentCasing = word;
      let highestFrequency = 0;

      Object.entries(wordCasingMap[lowerWord]).forEach(
        ([casing, frequency]) => {
          if (frequency > highestFrequency) {
            mostFrequentCasing = casing;
            highestFrequency = frequency;
          }
        },
      );

      return mostFrequentCasing;
    }

    // Always capitalize the first word if no casing info
    if (index === 0) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }

    // Check if this word should be lowercase
    if (lowercaseWords.includes(lowerWord)) {
      return lowerWord;
    }

    // Handle words that are all uppercase (likely abbreviations like "PS4")
    if (word === word.toUpperCase() && word.length <= 5) {
      return word;
    }

    // Standard capitalization
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  return capitalizedWords.join(" ");
}
