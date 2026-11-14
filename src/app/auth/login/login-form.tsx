"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();

  const formSchema = z.object({
    password: z.string().min(1, t("auth.passwordRequired")),
  });

  type FormValues = z.infer<typeof formSchema>;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "CredentialsSignin"
      ? t("common.error")
      : null,
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setIsLoading(true);
    setError(null);

    try {
      const callbackUrl = searchParams.get("callbackUrl") || "/";
      const result = await signIn("app-password", {
        password: values.password,
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        setError(t("auth.invalidCredentials"));
        form.setValue("password", values.password);
        return;
      }

      router.push(callbackUrl);
    } catch (err) {
      console.error("Unlock error:", err);
      setError(t("auth.loginError"));
      form.setValue("password", values.password);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("auth.password")}</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    placeholder={t("auth.passwordPlaceholder")}
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full mt-4" disabled={isLoading}>
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            {t("auth.unlockButton")}
          </Button>
        </form>
      </Form>
    </div>
  );
}
