import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthSessionProvider } from "@/components/session-provider";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://travel-planner-agent-nine.vercel.app"),
  title: {
    default: "Travel Planner",
    template: "%s · Travel Planner",
  },
  description:
    "Plan trips with an AI co-pilot — turn loose ideas into day-by-day itineraries, with picks tuned to how you like to travel.",
  applicationName: "Travel Planner",
  keywords: [
    "travel planner",
    "AI travel assistant",
    "trip planning",
    "itinerary",
    "travel recommendations",
  ],
  authors: [{ name: "Travel Planner" }],
  openGraph: {
    type: "website",
    siteName: "Travel Planner",
    title: "Travel Planner",
    description:
      "Plan trips with an AI co-pilot — turn loose ideas into day-by-day itineraries, with picks tuned to how you like to travel.",
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Travel Planner",
    description:
      "Plan trips with an AI co-pilot — turn loose ideas into day-by-day itineraries.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${dmSans.variable} ${instrumentSerif.variable} ${geistMono.variable} antialiased grain`}
      >
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
