"use client";

import { cn } from "@/lib/shared/utils";

/**
 * Pill tab bar used across the admin Catalogue — provider tabs, browse scope,
 * layout switches. Shared because the provider tabs live in `TcgEffectsPanel`
 * while the inner switches live in `FoilPlayroom`.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div
      role="tablist"
      className="inline-flex rounded-lg border border-border/80 bg-muted/30 p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              selected
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
