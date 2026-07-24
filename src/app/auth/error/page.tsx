"use client";

import Link from "next/link";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { Button } from "@/components/ui/button";

export default function AuthErrorPage() {
  const { t } = useLocale();

  return (
    <div className="flex h-screen p-4 w-screen flex-col items-center justify-center">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-md">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("auth.errorTitle")}
          </h1>

          <p className="text-sm text-muted-foreground">
            {t("auth.errorMessage")}
          </p>
        </div>

        <Button asChild>
          <Link href="/auth/login">{t("auth.backToLogin")}</Link>
        </Button>
      </div>
    </div>
  );
}
