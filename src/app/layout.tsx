import type { Metadata, Viewport } from "next";

import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

import ReactQueryProvider from "@/lib/providers/ReactQueryProvider";
import SessionProvider from "@/lib/providers/SessionProvider";

import "./globals.css";

const APP_NAME = "Placarr - Inventory Management";
const APP_DESCRIPTION = "All your inventory, always in your pocket.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: "%s - NJS App",
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
        <SessionProvider>
          <ReactQueryProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              {children}
              <Toaster />
            </ThemeProvider>
          </ReactQueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
