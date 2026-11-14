import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

import { isAllowedNextImageRemoteUrl } from "@/core/enrich/media/nextImageRemoteGuard";

function guardNextImageOptimization(req: {
  nextUrl: { pathname: string; searchParams: URLSearchParams };
}) {
  if (req.nextUrl.pathname !== "/_next/image") return null;

  const rawUrl = req.nextUrl.searchParams.get("url")?.trim();
  if (!rawUrl || !isAllowedNextImageRemoteUrl(rawUrl)) {
    return new NextResponse("Image host not allowed", { status: 400 });
  }

  return NextResponse.next();
}

export default withAuth(
  function middleware(req) {
    const imageGuard = guardNextImageOptimization(req);
    if (imageGuard) return imageGuard;

    const token = req.nextauth.token;
    const isAdmin = token?.role === "admin";

    if (req.nextUrl.pathname.startsWith("/admin") && !isAdmin) {
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        if (req.nextUrl.pathname === "/_next/image") return true;
        // Admin UI needs an unlocked owner session; everything else is public.
        if (req.nextUrl.pathname.startsWith("/admin")) {
          return token?.role === "admin";
        }
        return true;
      },
    },
  },
);

export const config = {
  matcher: [
    "/_next/image",
    "/((?!api|_next/static|_next/image|favicon.ico|public|uploads|auth/error|auth/login|auth/register|manifest.json|robots.txt|screenshots|icons|assets).*)",
  ],
};
