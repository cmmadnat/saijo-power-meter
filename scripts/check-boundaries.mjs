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
 *
 * A second check rides along, because it is the same kind of claim: that the
 * web app's live mode never reaches a fixture module. It walks the import graph
 * from every file a request can execute and fails if any chain lands in the
 * fixture generator — see the section near the bottom, and
 * docs/architecture/data-modes.md.
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

/** Where each workspace package lives, and the entry points its manifest declares. */
const PACKAGE_DIRS = {
  "@power-meter/domain": "packages/domain",
  "@power-meter/application": "packages/application",
  "@power-meter/infrastructure": "packages/infrastructure",
};

function exportsOf(pkg) {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, PACKAGE_DIRS[pkg], "package.json"), "utf8"),
  );
  return manifest.exports ?? { ".": manifest.main };
}

/**
 * A subpath the package's `exports` declares is a public entry point, not a
 * deep path: `@power-meter/infrastructure/fixtures` is one, and it exists so
 * the live path can be shown never to reach it (see the second check below).
 */
function entryPoints(pkg) {
  return new Set(
    Object.keys(exportsOf(pkg))
      .filter((key) => key !== ".")
      .map((key) => `${pkg}${key.slice(1)}`),
  );
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
        } else if (specifier !== pkg && !entryPoints(pkg).has(specifier)) {
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

// --- the live path never reaches a fixture ----------------------------------
//
// Step 8b's rule: the web app runs in `demo` or `live`, and nothing synthetic
// may be reachable from a live-mode render. That is a claim about the import
// graph, so it is checked on the import graph, the same way the rule above is.
//
// Roots are everything a request can execute in apps/web — routes, layout,
// components, lib, instrumentation — minus tests. From there every import is
// followed, static and dynamic, through the workspace packages' entry points.
// Exactly one edge is exempt: the dynamic import in the composition module that
// loads the demo adapter set, which runs only when DATA_MODE is demo. Any other
// route to the fixture directory fails the build, naming the chain.

const WEB = "apps/web";
const DEMO_EDGE = { from: `${WEB}/lib/data-mode.ts`, to: `${WEB}/lib/demo-adapters.ts` };
const FORBIDDEN = [
  "packages/infrastructure/src/fixtures/",
  // Replays fixtures into the warehouse; reaching it reaches the generator.
  "packages/infrastructure/src/warehouse/loader.ts",
];

function resolveFile(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    try {
      if (statSync(join(ROOT, candidate)).isFile()) return candidate.split(sep).join("/");
    } catch {
      // try the next
    }
  }
  return null;
}

function resolveImport(fromFile, specifier) {
  if (specifier.startsWith(".")) {
    return resolveFile(join(fromFile, "..", specifier));
  }
  if (specifier.startsWith("@/")) {
    return resolveFile(join(WEB, specifier.slice(2)));
  }
  const pkg = packageOf(specifier);
  if (PACKAGE_DIRS[pkg] === undefined) return null; // third-party: not ours to walk
  const subpath = specifier === pkg ? "." : `.${specifier.slice(pkg.length)}`;
  const target = exportsOf(pkg)[subpath];
  return target === undefined ? null : resolveFile(join(PACKAGE_DIRS[pkg], target));
}

function liveRoots() {
  const roots = [];
  if (!exists(join(ROOT, WEB))) return roots;
  for (const dir of ["app", "components", "lib"]) {
    if (!exists(join(ROOT, WEB, dir))) continue;
    for (const file of walk(join(ROOT, WEB, dir))) {
      const where = relative(ROOT, file).split(sep).join("/");
      if (/\.(test|spec)\./.test(where) || where === DEMO_EDGE.to) continue;
      roots.push(where);
    }
  }
  const instrumentation = resolveFile(`${WEB}/instrumentation`);
  if (instrumentation !== null) roots.push(instrumentation);
  return roots;
}

const cameFrom = new Map();
const queue = liveRoots();
for (const root of queue) cameFrom.set(root, null);
let walked = 0;

while (queue.length > 0) {
  const file = queue.shift();
  walked += 1;
  for (const specifier of specifiers(readFileSync(join(ROOT, file), "utf8"))) {
    const target = resolveImport(file, specifier);
    if (target === null || cameFrom.has(target)) continue;
    if (file === DEMO_EDGE.from && target === DEMO_EDGE.to) continue;
    cameFrom.set(target, file);
    if (FORBIDDEN.some((prefix) => target.startsWith(prefix))) {
      const chain = [target];
      for (let at = file; at !== null; at = cameFrom.get(at)) chain.unshift(at);
      violations.push(
        `${chain[0]}\n    reaches a fixture module on the live path:\n      ${chain.join("\n      -> ")}\n    Only lib/demo-adapters.ts may import @power-meter/infrastructure/fixtures, and only data-mode.ts may load it.`,
      );
      continue;
    }
    queue.push(target);
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
console.log(
  `Live path is fixture-free: ${walked} modules reachable from ${WEB} outside demo mode, none under ${FORBIDDEN[0]}`,
);
