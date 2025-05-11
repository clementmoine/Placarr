"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Alert, AlertDescription } from "@/components/ui/alert";

const formSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof formSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState<"guest" | "credentials" | false>(
    false,
  );
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "CredentialsSignin"
      ? "Invalid email or password"
      : null,
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setIsLoading("credentials");
    setError(null);

    try {
      const callbackUrl = searchParams.get("callbackUrl") || "/";
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
        form.setValue("email", values.email);
        form.setValue("password", values.password);
        return;
      }

      router.push(callbackUrl);
    } catch (err) {
      console.error("Login error:", err);
      setError("Something went wrong. Please try again.");
      form.setValue("email", values.email);
      form.setValue("password", values.password);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGuestLogin() {
    setIsLoading("guest");
    setError(null);

    try {
      const callbackUrl = searchParams.get("callbackUrl") || "/";
      const result = await signIn("guest", {
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        setError("Something went wrong. Please try again.");
        return;
      }

      router.push(callbackUrl);
    } catch (err) {
      console.error("Guest login error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Email */}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    placeholder="name@example.com"
                    type="email"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect="off"
                    disabled={isLoading === "credentials"}
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
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    disabled={isLoading === "credentials"}
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

          {/* Sign In Button */}
          <Button
            type="submit"
            className="w-full mt-4"
            disabled={isLoading === "credentials"}
          >
            {isLoading === "credentials" && (
              <Loader2 className="size-4 animate-spin" />
            )}
            Sign In
          </Button>
        </form>
      </Form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>

        {/* Or continue with */}
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">
            Or continue with
          </span>
        </div>
      </div>

      {/* Continue as Guest */}
      <Button
        variant="outline"
        type="button"
        className="w-full"
        disabled={isLoading === "guest"}
        onClick={handleGuestLogin}
      >
        {isLoading === "guest" && <Loader2 className="size-4 animate-spin" />}
        Continue as Guest
      </Button>
    </div>
  );
}
