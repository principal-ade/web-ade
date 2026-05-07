import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import "./globals.css";
// Required by SequenceDiagramRenderer (used inside @industry-theme/file-city-panel).
// Without this, .react-flow__viewport loses `transform-origin: 0 0` and nodes/edges
// render shifted because the viewport scale pivots around its center.
import "@xyflow/react/dist/style.css";
// Initialize OTEL on server startup (fallback for when instrumentation.ts doesn't run)
// This must be imported at the top level to run on server initialization
import { initializeOTEL } from "@/lib/otel-server-init";

// Disable static generation for all routes to prevent SSR errors
export const dynamic = 'force-dynamic';

// Call OTEL initialization immediately on server (only runs once)
if (typeof window === 'undefined') {
  initializeOTEL();
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // Re-enabled to extend into safe areas
};

export const metadata: Metadata = {
  title: "Principal AI",
  description: "A full-featured browser-based IDE with real-time collaboration",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Principal AI",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="en" style={{ background: "#0a0a0a" }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {gaId && <GoogleAnalytics gaId={gaId} />}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
