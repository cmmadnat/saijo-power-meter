#!/usr/bin/env node
/**
 * Enforces the dependency rule.
 *
 * Clean architecture is a claim about which way imports point, and a claim that
 * nothing checks stops being true within a few pull requests. This walks the
 * source and fails if any layer reaches outward.
 *
 *     domain          <- knows nothing. No framework, no SDK, no sibling layer.
 *     application     <- domain only. Owns the port interfaces.
 *     infrastructure  <- domain + application. Implements the ports.
 *     apps            <- all of the above. Wires them together.
 *
 * The inner two are also barred from importing any third-party package, which
 * is the rule that actually bites: it is what stops a BigQuery type or a React
 * hook from creeping into a use case and quietly welding the logic to its
 * delivery mechanism.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Which bare imports each layer may use. `external: false` means none at all. */
const LAYERS = {
  domain: { packages: [], external: false },
  application: { packages: ["@power-meter/domain"], external: false },
  infrastructure: {
    packages: ["@power-meter/domain", "@power-meter/application"],
    external: true,
  },
  app: {
    packages: [
      "@power-meter/domain",
      "@power-meter/application",
      "@power-meter/infrastructure",
    ],
    external: true,
  },
};

const WORKSPACE_PACKAGES = [
  "@power-meter/domain",
  "@power-meter/application",
  "@power-meter/infrastructure",
];

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs)$/;
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".git",
  "coverage",
]);

/** Roots to walk, and the layer each one is. */
function targets() {
  const found = [];
  for (const [dir, layer] of [
    ["packages/domain/src", "domain"],
    ["packages/application/src", "application"],
    ["packages/infrastructure/src", "infrastructure"],
  ]) {
    if (exists(join(ROOT, dir))) found.push({ dir, layer });
  }
  const appsDir = join(ROOT, "apps");
  if (exists(appsDir)) {
    for (const app of readdirSync(appsDir)) {
      if (SKIP_DIRS.has(app)) continue;
      if (!statSync(join(appsDir, app)).isDirectory()) continue;
      found.push({ dir: join("apps", app), layer: "app" });
    }
  }
  return found;
}

function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SOURCE.test(entry.name)) yield full;
  }
}

/**
 * Import specifiers in a source file. A regex rather than a parser: the shapes
 * that matter are `import ... from "x"`, `export ... from "x"`, bare `import
 * "x"` and `import("x")`, and all four are unambiguous enough to match. A
 * false negative here would let a violation through, so the patterns stay
 * broad rather than clever.
 */
function specifiers(source) {
  const out = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) out.push(match[1]);
  }
  return out;
}

function packageOf(specifier) {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return name ? `${scope}/${name}` : specifier;
  }
  return specifier.split("/")[0];
}

const violations = [];

for (const { dir, layer } of targets()) {
  const rules = LAYERS[layer];
  for (const file of walk(join(ROOT, dir))) {
    const isTest = /\.(test|spec)\./.test(file);
    const where = relative(ROOT, file).split(sep).join("/");

    for (const specifier of specifiers(readFileSync(file, "utf8"))) {
      // Relative imports stay within their own layer by construction.
      if (specifier.startsWith(".") || specifier.startsWith("/")) continue;

      // Node builtins are allowed in tests everywhere, and in the outer layers.
      if (specifier.startsWith("node:")) {
        if (isTest || rules.external) continue;
        violations.push(
          `${where}\n    imports "${specifier}" — the ${layer} layer stays free of the runtime; keep node APIs in infrastructure.`,
        );
        continue;
      }

      const pkg = packageOf(specifier);

      if (WORKSPACE_PACKAGES.includes(pkg)) {
        if (!rules.packages.includes(pkg)) {
          violations.push(
            `${where}\n    imports "${specifier}" — the ${layer} layer may not depend on ${pkg}. The dependency rule points inward.`,
          );
        } else if (specifier !== pkg) {
          violations.push(
            `${where}\n    imports "${specifier}" — reach into ${pkg} through its public entry point, not a deep path.`,
          );
        }
        continue;
      }

      if (!rules.external) {
        violations.push(
          `${where}\n    imports "${specifier}" — the ${layer} layer may not depend on third-party packages. Put it behind a port.`,
        );
      }
    }
  }
}

const checked = targets()
  .map((t) => t.dir)
  .join(", ");

if (violations.length > 0) {
  console.error(`\nDependency rule violated (${violations.length}):\n`);
  for (const violation of violations) console.error(`  ${violation}\n`);
  console.error(
    "The rule is documented in docs/architecture/clean-architecture.md.\n",
  );
  process.exit(1);
}

console.log(`Dependency rule holds across: ${checked}`);
