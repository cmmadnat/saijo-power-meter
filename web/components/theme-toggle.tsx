"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // Which icon shows is decided by the `dark` class next-themes puts on <html>,
  // not by component state. That keeps the server and client markup identical,
  // so there is no hydration mismatch and no need to render a blank button on
  // the first pass.
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Toggle between light and dark theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Moon className="size-4 dark:hidden" />
      <Sun className="hidden size-4 dark:block" />
    </Button>
  );
}
