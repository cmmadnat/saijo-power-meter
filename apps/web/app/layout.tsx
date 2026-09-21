import type { Metadata } from "next";
import { Oxanium, Source_Code_Pro } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import { MeterRegistry } from "@power-meter/domain";
import "./globals.css";

// The Doom 64 theme names Oxanium (sans) and Source Code Pro (mono) without
// installing them, so they have to be loaded here or the theme falls back to
// system faces. Its serif is already a system stack, so nothing to load there.
const oxanium = Oxanium({
  variable: "--font-oxanium",
  subsets: ["latin"],
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code-pro",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Power Meter — Saijo Smart Factory",
  description:
    "Real-time and historical power consumption across the factory's metered machines.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
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
      className={`${oxanium.variable} ${sourceCodePro.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <AppShell fleet={fleet}>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
