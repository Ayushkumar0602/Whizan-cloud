import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const defaultApiUrl = isDev ? "http://localhost:8000" : "https://api.whizan.cloud";
const apiUrl = process.env.NEXT_PUBLIC_API_URL || defaultApiUrl;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: apiUrl,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: "/live/:path*",
        destination: `${apiUrl}/live/:path*`,
      },
    ];
  },
};

export default nextConfig;
