/**
 * Present ItemPresenceEvent rows for the item timeline UI.
 */

import {
  isAbsenceReason,
  isPresenceEventKind,
  type AbsenceReason,
  type PresenceEventKind,
} from "@/core/collect/itemAbsence";

export type PresenceTimelineEvent = {
  id: string;
  at: string;
  fromPresence: string;
  toPresence: string;
  reason: string | null;
  kind: string;
  snapshot: Record<string, unknown> | null;
};

export type PresenceTimelineLabelKey =
  | `items.timeline.kind.${PresenceEventKind}`
  | `items.timeline.reason.${AbsenceReason}`
  | "items.timeline.kind.unknown"
  | "items.timeline.reason.unknown";

export function presenceEventKindLabelKey(
  kind: string,
): PresenceTimelineLabelKey {
  if (isPresenceEventKind(kind)) {
    return `items.timeline.kind.${kind}`;
  }
  return "items.timeline.kind.unknown";
}

export function presenceEventReasonLabelKey(
  reason: string | null | undefined,
): PresenceTimelineLabelKey | null {
  if (!reason) return null;
  if (isAbsenceReason(reason)) {
    return `items.timeline.reason.${reason}`;
  }
  return "items.timeline.reason.unknown";
}

/** Child count frozen in open / declare / materialize snapshots. */
export function presenceEventChildCount(
  snapshot: Record<string, unknown> | null,
): number | null {
  if (!snapshot) return null;
  const raw = snapshot.childCount;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  return null;
}
