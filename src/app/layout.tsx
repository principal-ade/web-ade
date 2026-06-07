import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
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
  themeColor: "#0d274d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // Re-enabled to extend into safe areas
};

const SITE_TITLE = "Principal AI";
const SITE_DESCRIPTION =
  "Code Trails: Frame.io for code collaboration";

async function resolveBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ||
    (process.env.NODE_ENV === "production" ? "https" : "http");
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    `${proto}://${host}`
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await resolveBaseUrl();
  const imageUrl = `${baseUrl}/api/og`;

  return {
    metadataBase: new URL(baseUrl),
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: SITE_TITLE,
    },
    formatDetection: {
      telephone: false,
    },
    openGraph: {
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      type: "website",
      url: baseUrl,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 628,
          alt: "Principal AI — Code trails",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [imageUrl],
    },
  };
}

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
