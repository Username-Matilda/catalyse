import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/next",
  env: {
    NEXT_PUBLIC_BASE_PATH: "/next",
  },
  async redirects() {
    return [
      { source: "/", destination: "/next", basePath: false, permanent: false },
    ];
  },
};

export default nextConfig;
