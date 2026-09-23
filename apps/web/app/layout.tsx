import type { Metadata } from "next";
import { connection } from "next/server";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import { MeterRegistry } from "@power-meter/domain";
import { provenance } from "@/lib/data-mode";
import "./globals.css";

// The Light Green theme names Inter (sans) and JetBrains Mono (mono) without
// installing them, so they have to be loaded here or the theme falls back to
// system faces. Its serif is Georgia, already a system stack, so nothing to
// load there. JetBrains Mono carries every reading in the product, which is why
// a mono with tabular figures is worth the weight.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Power Meter — Saijo Smart Factory",
  description:
    "Real-time and historical power consumption across the factory's metered machines.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The badge is read from DATA_MODE, which belongs to the running process,
  // not to the build. Without this the 404 page is prerendered at build time —
  // where DATA_MODE is unset, so demo — and a live deployment would print
  // "Demo data" on every not-found page. Every other route is dynamic already.
  await connection();

  // Read on the server so the registry never reaches the client bundle.
  const registry = MeterRegistry.fromWorkbook();
  const commissioned = registry.commissioned();
  const standby = commissioned[0]?.standbyPowerKw ?? null;
  const fleet = {
    stations: registry.topics().length,
    meters: commissioned.length,
    standbyKw: commissioned.every((m) => m.standbyPowerKw === standby)
      ? standby
      : null,
  };

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <AppShell fleet={fleet} badge={provenance().badge}>
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
