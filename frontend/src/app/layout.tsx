import type { Metadata, Viewport } from "next";
import { Fredoka, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

// Rounded, friendly headings.
const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "NeoCity Career Explorer",
    template: "%s · NeoCity Career Explorer",
  },
  description:
    "Explore careers, talk with an AI career counselor, and plan your future with NeoCity Academy.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${jakarta.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full font-sans text-[15px] leading-relaxed sm:text-base"
      >
        {children}
      </body>
    </html>
  );
}
