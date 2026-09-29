import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The server artifact is deployed separately from the Windows client.
  // Keep Prisma's generated client and native engine in the traced server output.
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/.prisma/client/**/*",
      "./node_modules/@prisma/client/**/*",
    ],
  },
};

export default nextConfig;
