import { plugin as shadcn } from "@shadcn/lint";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: { shadcn },
    rules: {
      // Layout is the caller's business; a component owns its own colour,
      // spacing, size and shape. Restyling one means adding a variant.
      "shadcn/no-restyle": ["error", { allow: ["layout"] }],
      "shadcn/no-raw-colors": "error",
      "shadcn/no-unknown-classes": "error",
      "shadcn/require-static-classes": "error",
      // Off for now: 28 findings, most of them the deliberate sub-12px type
      // scale (text-[11px], text-[10px]). Needs theme tokens, not a rounding.
      // "shadcn/no-arbitrary-values": "error",
      // Off: every finding is a genuinely dynamic value — measured chart
      // height, computed tooltip position, var(--series-N) swatches.
      // "shadcn/no-inline-styles": "error",
    },
  },
  {
    // The primitives own their styling; the rules above describe how the
    // rest of the app may use them.
    files: ["components/ui/**"],
    rules: { "shadcn/no-restyle": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
