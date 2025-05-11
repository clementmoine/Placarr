import Link from "next/link";
import { Metadata } from "next";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Authentication Error",
  description: "An error occurred during authentication",
};

export default function AuthErrorPage() {
  return (
    <div className="flex h-screen p-4 w-screen flex-col items-center justify-center">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-md">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Authentication Error
          </h1>

          <p className="text-sm text-muted-foreground">
            An error occurred during authentication. Please try again.
          </p>
        </div>

        <Button asChild>
          <Link href="/auth/login">Back to Login</Link>
        </Button>
      </div>
    </div>
  );
}
