"use client";

import { Barcode, Search } from "lucide-react";
import { toast } from "sonner";

import { useLocale } from "@/lib/client/providers/LocaleProvider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  scannerBarcodePlaceholderKey,
  scannerEnterBarcodeKey,
} from "@/lib/barcode/shelfLabels";

export function cleanManualBarcode(value: string): string {
  return value.replace(/[^\d]/g, "").trim();
}

export function ManualBarcodeEntry({
  value,
  onValueChange,
  onSubmit,
  disabled,
  className,
  shelfType,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (barcode: string) => void;
  disabled?: boolean;
  className?: string;
  shelfType?: string | null;
}) {
  const { t } = useLocale();
  const cleanedValue = cleanManualBarcode(value);

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        if (!cleanedValue) {
          toast.error(t(scannerEnterBarcodeKey(shelfType)));
          return;
        }
        onSubmit(cleanedValue);
      }}
    >
      <div className="relative flex w-full items-center gap-2">
        <Barcode className="absolute left-3.5 size-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={t(scannerBarcodePlaceholderKey(shelfType))}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className="h-11 w-full rounded-2xl border-border/70 bg-zinc-50/80 pl-10 pr-28 text-sm dark:bg-zinc-950/30"
        />
        <Button
          type="submit"
          disabled={disabled || !cleanedValue}
          className="absolute right-1 h-9 rounded-xl px-3 text-xs font-bold"
        >
          <Search className="size-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">{t("common.search")}</span>
        </Button>
      </div>
    </form>
  );
}
