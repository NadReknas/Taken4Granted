import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://api.railway.internal:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
