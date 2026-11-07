"use client";

import Link from "next/link";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

import { Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { LoginForm } from "./login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const { t } = useLocale();
  const [registrationOpen, setRegistrationOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/register")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { open?: boolean } | null) => {
        if (!cancelled && data?.open) setRegistrationOpen(true);
      })
      .catch(() => {
        /* keep closed on error */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-screen p-4 w-screen flex-col items-center justify-center">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-md">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">
              {t("auth.unlockTitle")}
            </CardTitle>

            <CardDescription className="text-center">
              {t("auth.unlockDescription")}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Suspense
              fallback={
                <div className="flex justify-center p-4">
                  <Loader2 className="animate-spin text-muted-foreground" />
                </div>
              }
            >
              <LoginForm />
            </Suspense>
          </CardContent>

          {registrationOpen && (
            <CardFooter className="flex flex-wrap items-center justify-center gap-2">
              <div className="text-sm text-muted-foreground">
                {t("auth.dontHaveAccount")}{" "}
                <Link
                  href="/auth/register"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {t("auth.registerButton")}
                </Link>
              </div>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
