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
      // The sub-12px type scale is now text-2xs / text-3xs in globals.css and
      // every exact-equivalent width is on the spacing scale, so this can stay
      // on. The two exceptions are values the scale cannot express: a measure
      // in ch, which is a count of characters rather than a length, and an
      // explicit grid track pair.
      "shadcn/no-arbitrary-values": [
        "error",
        { allow: ["max-w-[*ch]", "grid-cols-[240px_minmax(0,1fr)]"] },
      ],
      // Off: every finding is a genuinely dynamic value — measured chart
      // height, computed tooltip position, var(--series-N) swatches.
      // "shadcn/no-inline-styles": "error",
    },
  },
  {
    // The primitives own their styling; the rules above describe how the
    // rest of the app may use them.
    files: ["components/ui/**"],
    rules: {
      "shadcn/no-restyle": "off",
      // Structural values belong to the primitives; button.tsx ships
      // focus-visible:ring-[3px] from upstream.
      "shadcn/no-arbitrary-values": "off",
    },
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
