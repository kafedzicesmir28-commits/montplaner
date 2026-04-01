import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: '/monthsplanner', destination: '/montatsplaner', permanent: false }];
  },
};

export default nextConfig;
