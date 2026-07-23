import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }]
      }
    ];
  },
  experimental: {
    optimizePackageImports: ['react']
  }
};

export default nextConfig;
