import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a minimal server.js and only the node_modules
  // it actually needs, which is what the container image ships.
  output: "standalone",

  // In a workspace, file tracing defaults to this app's own directory, which
  // would leave the hoisted node_modules and the sibling packages out of the
  // standalone output. Pointing it at the repository root is what makes the
  // image contain @power-meter/domain and its dependencies at all.
  //
  // It also moves the output: server.js lands at
  // .next/standalone/apps/web/server.js, which the Dockerfile accounts for.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),

  // The domain and application layers ship as TypeScript source rather than a
  // build step, so Next has to compile them like its own code.
  transpilePackages: ["@power-meter/domain", "@power-meter/application"],
};

export default nextConfig;
