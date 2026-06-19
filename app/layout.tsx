import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MSN Developers — AI Calling Agent",
  description: "AI-powered client qualification and sales call assistant. Secure internal calling console for MSN Developers.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // prevent zoom disrupting the fixed layout
  viewportFit: "cover", // support notch / Dynamic Island on iOS
  themeColor: "#0A0A0A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      style={{ height: "100dvh", overflow: "hidden" }}
    >
      <body style={{ height: "100%", overflow: "hidden" }}>{children}</body>
    </html>
  );
}
