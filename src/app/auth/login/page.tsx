"use client";

import Link from "next/link";
import { useLocale } from "@/lib/providers/LocaleProvider";

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

  return (
    <div className="flex h-screen p-4 w-screen flex-col items-center justify-center">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-md">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">
              {t("auth.loginTitle")} 👋
            </CardTitle>

            <CardDescription className="text-center">
              {t("auth.loginDescription")}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <LoginForm />
          </CardContent>

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
        </Card>
      </div>
    </div>
  );
}
