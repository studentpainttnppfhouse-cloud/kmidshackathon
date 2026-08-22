import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import {
  BackToTop,
  CookieNotice,
  ScrollProgress,
  ThemeScript,
} from "@/components/chrome";
import { UtmCapture } from "@/components/form-bits";

export const metadata: Metadata = {
  title: {
    default: "Hackathon Studio",
    template: "%s · Hackathon Studio",
  },
  description: "Staff portal for KMIDS Hackathon 2027.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Hackathon Studio", statusBarStyle: "default" },
  // The portal is invite-only staff data. It has no business in a search index.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EC4899" },
    { media: "(prefers-color-scheme: dark)", color: "#17121A" },
  ],
  width: "device-width",
  initialScale: 1,
  // Half of all usage is on a phone; pinch-zoom must keep working.
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by middleware.ts, one per request. Passing it to the inline theme
  // script is what lets the CSP stay nonce-based rather than 'unsafe-inline'.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <ThemeScript nonce={nonce} />
      </head>
      <body>
        <a href="#hs-main" className="hs-skip-link">
          Skip to content
        </a>
        <ScrollProgress />
        <UtmCapture />
        {children}
        <BackToTop />
        <CookieNotice />
      </body>
    </html>
  );
}
