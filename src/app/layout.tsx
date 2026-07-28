import type { Metadata, Viewport } from "next";

import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

import ReactQueryProvider from "@/lib/client/providers/ReactQueryProvider";
import SessionProvider from "@/lib/client/providers/SessionProvider";
import { LocaleProvider } from "@/lib/client/providers/LocaleProvider";

import "./globals.css";

const APP_NAME = "Placarr - Inventory Management";
const APP_DESCRIPTION = "All your inventory, always in your pocket.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: "Placarr",
    template: "%s · Placarr",
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    shortcut: "/favicon.ico",
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Suppress hydration warning for the html tag due to the theme provider
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body>
        {/*
          Ravensburger ships its varnish masks as normal maps, not coverage
          masks: R and G carry the surface slope and sit at a constant ~127/128,
          while B carries whether anything is stamped there at all. Fed to
          `multiply` as-is, the mid-grey let half the effect through across the
          whole card, so the varnish washed over the art instead of landing on
          the engraved line work.

          This pulls B into all three channels, turning the map into the
          coverage mask the compositing already expects. Defined once here
          rather than per card — every foil card on a shelf would otherwise
          repeat it.
        */}
        <svg aria-hidden className="absolute size-0" focusable="false">
          <filter id="holo-varnish-coverage" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="0 0 1 0 0
                      0 0 1 0 0
                      0 0 1 0 0
                      0 0 0 1 0"
            />
          </filter>
        </svg>
        <SessionProvider>
          <ReactQueryProvider>
            <LocaleProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                {children}
                <Toaster />
              </ThemeProvider>
            </LocaleProvider>
          </ReactQueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
