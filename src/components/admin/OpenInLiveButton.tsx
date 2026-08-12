"use client";

import { useCallback, useState, type MouseEvent } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

type LiveOpenResponse = {
  ok?: boolean;
  error?: string;
  hint?: string;
  cardId?: string;
  name?: string;
  ms?: number;
  via?: string;
};

/**
 * Compact admin control: open this Live face on MuMu via Frida.
 * Keeps foil captions free of Live chrome — status lives on the button only.
 */
export function OpenInLiveButton({
  bundleId,
  material,
  locale = "fr",
  className,
}: {
  bundleId: string;
  material?: string | null;
  locale?: string;
  className?: string;
}) {
  const fr = locale === "fr";
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const open = useCallback(
    async (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!bundleId || busy) return;
      setBusy(true);
      setHint(null);
      try {
        const response = await fetch("/api/admin/live-open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bundleId,
            ...(material ? { material } : {}),
          }),
        });
        const data = (await response.json()) as LiveOpenResponse;
        if (!response.ok || !data.ok) {
          setHint(
            data.error ??
              data.hint ??
              (fr ? "Ouverture Live échouée" : "Live open failed"),
          );
          return;
        }
        setHint(
          [
            data.cardId ?? (fr ? "Ouvert" : "Opened"),
            data.ms != null ? `${data.ms} ms` : null,
            data.via === "daemon" ? "warm" : data.via === "cold" ? "cold" : null,
          ]
            .filter(Boolean)
            .join(" · "),
        );
      } catch (error) {
        setHint(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [bundleId, busy, fr, material],
  );

  return (
    <span className={cn("inline-flex flex-col items-start gap-0.5", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy || !bundleId}
        onClick={open}
        className="h-7 gap-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300"
        title={
          fr
            ? "Ouvrir cette face dans TCG Live (MuMu)"
            : "Open this face in TCG Live (MuMu)"
        }
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        Live
      </Button>
      {hint ? (
        <span
          className="max-w-[14rem] truncate text-[10px] text-muted-foreground"
          title={hint}
        >
          {hint}
        </span>
      ) : null}
    </span>
  );
}
