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
    // String literals — keep this Edge/proxy bundle free of Prisma client.
    const isAdmin = token?.role === "admin";
    const isGuest = token?.role === "guest";

    // Allow guests to access read-only routes
    if (isGuest) {
      if (req.method !== "GET") {
        return NextResponse.redirect(new URL("/auth/login", req.url));
      }
    }

    // Protect admin routes
    if (req.nextUrl.pathname.startsWith("/admin") && !isAdmin) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) =>
        req.nextUrl.pathname === "/_next/image" || !!token,
    },
  },
);

export const config = {
  matcher: [
    "/_next/image",
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - favicon.ico (favicon file)
     * - manifest.json (manifest file)
     * - robots.txt (robots file)
     * - screenshots/wide or screenshots/narrow (screenshots)
     * - sw.js (service worker file)
     * - icons (icons)
     * - public folder and uploaded media
     * - auth/error (auth error page)
     * - auth/login (login page)
     * - auth/register (register page)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|public|uploads|auth/error|auth/login|auth/register|manifest.json|robots.txt|screenshots|sw.js|icons).*)",
  ],
};
