"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/", label: "Real time" },
  { href: "/history", label: "History" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <span className="truncate text-lg font-semibold tracking-wide uppercase">
              Power Meter
            </span>
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              Saijo Smart Factory
            </span>
          </div>

          <nav aria-label="Sections" className="flex items-center gap-1">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "border px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-3">
            <span className="hidden font-mono text-xs text-muted-foreground md:inline">
              Asia/Bangkok
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-border px-4 py-3">
        <div className="mx-auto w-full max-w-[1600px] font-mono text-xs text-muted-foreground">
          9 stations · 55 commissioned meters · standby 0.1 kW
        </div>
      </footer>
    </div>
  );
}
