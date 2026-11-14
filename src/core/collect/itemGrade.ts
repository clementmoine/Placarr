/**
 * Professional grading / slabs — orthogonal to {@link Condition}.
 *
 * - `raw` : not in the pipeline
 * - `submitted` : WIP at the house
 * - `graded` : slab back with a label
 */

export const GRADE_STATUSES = ["raw", "submitted", "graded"] as const;
export type GradeStatus = (typeof GRADE_STATUSES)[number];

/** Common houses — free text still allowed for others. */
export const KNOWN_GRADE_HOUSES = ["PSA", "CGC", "BGS", "SGC", "ACE"] as const;
export type KnownGradeHouse = (typeof KNOWN_GRADE_HOUSES)[number];

export type ItemGradeFields = {
  gradeStatus: GradeStatus;
  gradeHouse: string | null;
  gradeLabel: string | null;
  gradeCertNo: string | null;
  gradedAt: Date | null;
};

export type ItemGradeSnapshot = Partial<{
  gradeStatus: GradeStatus | string | null;
  gradeHouse: string | null;
  gradeLabel: string | null;
  gradeCertNo: string | null;
  gradedAt: Date | string | null;
}>;

const STATUS_SET = new Set<string>(GRADE_STATUSES);

export function isGradeStatus(value: unknown): value is GradeStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

export function rawGradeState(): ItemGradeFields {
  return {
    gradeStatus: "raw",
    gradeHouse: null,
    gradeLabel: null,
    gradeCertNo: null,
    gradedAt: null,
  };
}

function trimToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseDateInput(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Normalize house casing for known names (PSA not psa). */
export function normalizeGradeHouse(
  value: string | null | undefined,
): string | null {
  const raw = trimToNull(value);
  if (!raw) return null;
  const upper = raw.toUpperCase();
  for (const house of KNOWN_GRADE_HOUSES) {
    if (house === upper) return house;
  }
  return raw;
}

export function readItemGrade(
  item: ItemGradeSnapshot | null | undefined,
): ItemGradeFields {
  if (!item) return rawGradeState();
  const status = isGradeStatus(item.gradeStatus) ? item.gradeStatus : "raw";
  if (status === "raw") return rawGradeState();
  return {
    gradeStatus: status,
    gradeHouse: normalizeGradeHouse(item.gradeHouse),
    gradeLabel: trimToNull(item.gradeLabel),
    gradeCertNo: trimToNull(item.gradeCertNo),
    gradedAt: parseDateInput(item.gradedAt),
  };
}

/**
 * Merge a write patch onto current grade fields.
 * `gradeStatus: "raw"` (or null) clears the slab fields.
 */
export function mergeItemGrade(
  current: ItemGradeSnapshot | null | undefined,
  patch: ItemGradeSnapshot,
): ItemGradeFields | undefined {
  const hasAny =
    patch.gradeStatus !== undefined ||
    patch.gradeHouse !== undefined ||
    patch.gradeLabel !== undefined ||
    patch.gradeCertNo !== undefined ||
    patch.gradedAt !== undefined;
  if (!hasAny) return undefined;

  if (patch.gradeStatus === "raw" || patch.gradeStatus === null) {
    return rawGradeState();
  }

  const base = readItemGrade(current);
  const house =
    patch.gradeHouse !== undefined
      ? normalizeGradeHouse(patch.gradeHouse)
      : base.gradeHouse;
  const label =
    patch.gradeLabel !== undefined
      ? trimToNull(patch.gradeLabel)
      : base.gradeLabel;
  const cert =
    patch.gradeCertNo !== undefined
      ? trimToNull(patch.gradeCertNo)
      : base.gradeCertNo;

  let status: GradeStatus = base.gradeStatus;
  if (isGradeStatus(patch.gradeStatus)) {
    status = patch.gradeStatus;
  } else if (base.gradeStatus === "raw") {
    status = label || cert ? "graded" : "submitted";
  }

  let gradedAt =
    patch.gradedAt !== undefined
      ? parseDateInput(patch.gradedAt)
      : base.gradedAt;

  if (status === "submitted") {
    gradedAt = null;
  } else if (status === "graded" && !gradedAt) {
    gradedAt = new Date();
  }

  return {
    gradeStatus: status,
    gradeHouse: house,
    gradeLabel: label,
    gradeCertNo: cert,
    gradedAt,
  };
}

/** Short badge text — `PSA 10` / `CGC · WIP` / null when raw. */
export function formatGradeBadge(
  grade: Pick<
    ItemGradeFields,
    "gradeStatus" | "gradeHouse" | "gradeLabel"
  > | null | undefined,
): string | null {
  if (!grade || grade.gradeStatus === "raw") return null;
  const house = grade.gradeHouse?.trim() || null;
  const label = grade.gradeLabel?.trim() || null;
  if (grade.gradeStatus === "submitted") {
    return house ? `${house} · WIP` : "WIP";
  }
  if (house && label) return `${house} ${label}`;
  if (label) return label;
  if (house) return house;
  return "Graded";
}

export function isGradeWip(
  grade: Pick<ItemGradeFields, "gradeStatus"> | null | undefined,
): boolean {
  return grade?.gradeStatus === "submitted";
}

export function isGradedSlab(
  grade: Pick<ItemGradeFields, "gradeStatus"> | null | undefined,
): boolean {
  return grade?.gradeStatus === "graded";
}
