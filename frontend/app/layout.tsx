import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";

import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
