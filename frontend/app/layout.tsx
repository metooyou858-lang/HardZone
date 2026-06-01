import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { NumberInputScrollGuard } from "@/components/number-input-scroll-guard";

import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hardzone Warehouse",
  description: "Administrative warehouse dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full bg-[var(--bg-app)] text-[var(--text-main)]">
        <NumberInputScrollGuard />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
