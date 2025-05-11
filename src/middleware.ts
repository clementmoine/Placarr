import { UserRole } from "@prisma/client";
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const isAdmin = token?.role === UserRole.admin;
    const isGuest = token?.role === UserRole.guest;

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
      authorized: ({ token }) => !!token,
    },
  },
);

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json (manifest file)
     * - robots.txt (robots file)
     * - screenshots/wide or screenshots/narrow (screenshots)
     * - sw.js (service worker file)
     * - icons (icons)
     * - public folder
     * - auth/error (auth error page)
     * - auth/login (login page)
     * - auth/register (register page)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|public|auth/error|auth/login|auth/register|manifest.json|robots.txt|screenshots|sw.js|icons).*)",
  ],
};
