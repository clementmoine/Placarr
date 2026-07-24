"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLocale();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-6 p-6 text-center">
      <AlertTriangle className="size-10 text-muted-foreground" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("errors.genericTitle")}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("errors.genericMessage")}
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => reset()}>{t("errors.tryAgain")}</Button>
        <Button variant="outline" asChild>
          <Link href="/shelves">{t("errors.goHome")}</Link>
        </Button>
      </div>
    </div>
  );
}
