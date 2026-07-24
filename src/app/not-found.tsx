"use client";

import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

export default function NotFound() {
  const { t } = useLocale();

  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-6 p-6 text-center">
      <Compass className="size-10 text-muted-foreground" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("errors.notFoundTitle")}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("errors.notFoundMessage")}
        </p>
      </div>
      <Button asChild>
        <Link href="/shelves">{t("errors.goHome")}</Link>
      </Button>
    </div>
  );
}
