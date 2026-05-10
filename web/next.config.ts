import type { NextConfig } from "next";

const basePath = process.env.NEXT_BASE_PATH ?? "/next";

const nextConfig: NextConfig = {
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  async redirects() {
    if (!basePath) return [];
    return [
      { source: "/", destination: basePath, basePath: false, permanent: false },
    ];
  },
};

export default nextConfig;
