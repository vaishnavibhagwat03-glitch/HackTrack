import type { NextConfig } from "next";

// Self-hosted by design: no remote images, no telemetry-dependent features.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // Docker builds set NEXT_OUTPUT=standalone: a self-contained server.js with only the files it needs.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
