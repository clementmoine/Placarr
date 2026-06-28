"use client";

import Link from "next/link";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

import { RegisterForm } from "./register-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RegisterPage() {
  const { t } = useLocale();

  return (
    <div className="flex h-screen p-4 w-screen flex-col items-center justify-center">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-md">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">
              {t("auth.registerTitle")} 🚀
            </CardTitle>

            <CardDescription className="text-center">
              {t("auth.description")}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <RegisterForm />
          </CardContent>

          <CardFooter className="flex flex-wrap items-center justify-center gap-2">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              {t("auth.alreadyHaveAccount")}
              <Link
                href="/auth/login"
                className="text-primary underline-offset-4 hover:underline"
              >
                {t("auth.loginButton")}
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
