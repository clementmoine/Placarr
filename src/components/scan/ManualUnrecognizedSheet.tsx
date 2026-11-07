"use client";

import { useState } from "react";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { cn } from "@/lib/shared/utils";

export type ManualUnrecognizedPayload = {
  title: string;
  barcode: string;
};

export function ManualUnrecognizedSheet({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: ManualUnrecognizedPayload) => void;
}) {
  const { t } = useLocale();
  const [title, setTitle] = useState("");
  const [barcode, setBarcode] = useState("");

  if (!open) return null;

  const canSubmit = title.trim().length > 0 || barcode.trim().length >= 8;

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-black/45"
        aria-label={t("common.close")}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex flex-col rounded-t-3xl bg-zinc-950 text-white border-t border-white/10 shadow-2xl max-h-[70%]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="w-full pt-3 pb-1 shrink-0 cursor-pointer"
          onClick={onClose}
          aria-label={t("common.cancel")}
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />
        </button>
        <div className="px-4 pb-3 space-y-1">
          <h2 className="text-sm font-bold">{t("scanner.unrecognizedTitle")}</h2>
          <p className="text-[11px] text-white/60">
            {t("scanner.unrecognizedHint")}
          </p>
        </div>
        <div className="px-4 pb-4 space-y-3 overflow-y-auto">
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-white/50 font-semibold">
              {t("scanner.customName")}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("scanner.customName")}
              className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-white/50 font-semibold">
              {t("scanner.manualBarcodePlaceholder")}
            </span>
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              inputMode="numeric"
              placeholder={t("scanner.manualBarcodePlaceholder")}
              className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border border-white/15 text-sm font-semibold cursor-pointer"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => {
                onConfirm({
                  title: title.trim(),
                  barcode: barcode.trim(),
                });
                setTitle("");
                setBarcode("");
              }}
              className={cn(
                "flex-1 h-11 rounded-xl text-sm font-bold cursor-pointer",
                canSubmit
                  ? "bg-white text-zinc-950"
                  : "bg-white/20 text-white/40 cursor-not-allowed",
              )}
            >
              {t("scanner.addManually")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
