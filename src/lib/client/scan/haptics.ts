/**
 * Short / long haptic pulses via Vibration API (Android Chrome; no-op elsewhere).
 */

export function isHapticSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function hapticShort(): void {
  try {
    navigator.vibrate?.(40);
  } catch {
    /* ignore */
  }
}

export function hapticLong(): void {
  try {
    navigator.vibrate?.(120);
  } catch {
    /* ignore */
  }
}

export function hapticError(): void {
  try {
    navigator.vibrate?.([30, 40, 30]);
  } catch {
    /* ignore */
  }
}
