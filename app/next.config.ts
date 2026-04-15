import path from 'node:path';
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    return [
      { source: '/monthsplanner', destination: '/montatsplaner', permanent: false },
      { source: '/monatsplaner', destination: '/montatsplaner', permanent: false },
    ];
  },
};

export default nextConfig;
