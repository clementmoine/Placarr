"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FormValues {
  name: string;
  email: string;
  password: string;
}

export function RegisterForm() {
  const { t } = useLocale();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formSchema = z.object({
    name: z.string().min(2, t("auth.nameMinLength")),
    email: z.string().email(t("auth.invalidEmail")),
    password: z.string().min(8, t("auth.passwordMinLength")),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to register");
      }

      // Only redirect on success
      router.push("/auth/login?registered=true");
    } catch (err) {
      console.error("Registration error:", err);
      setError(
        err instanceof Error ? err.message : t("common.somethingWentWrong"),
      );
      // Preserve form values on error
      form.setValue("name", values.name);
      form.setValue("email", values.email);
      form.setValue("password", values.password);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("common.name")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("auth.namePlaceholder")}
                    autoCapitalize="words"
                    autoComplete="name"
                    autoCorrect="off"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Email */}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("auth.email")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("auth.emailPlaceholder")}
                    type="email"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect="off"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Password */}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("auth.password")}</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("auth.passwordPlaceholder")}
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Create Account Button */}
          <Button type="submit" className="w-full mt-4" disabled={isLoading}>
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            {t("auth.registerButton")}
          </Button>
        </form>
      </Form>
    </div>
  );
}
