import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a minimal server.js and only the node_modules
  // it actually needs, which is what the container image ships. Without it the
  // image has to carry the full dependency tree.
  output: "standalone",
};

export default nextConfig;
