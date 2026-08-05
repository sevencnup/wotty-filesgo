const { PHASE_DEVELOPMENT_SERVER } = require('next/constants')

module.exports = (phase) => {
  /** @type {import('next').NextConfig} */
  const nextConfig = {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : 'dist',
    output: 'export',
    eslint: {
      ignoreDuringBuilds: true,
    },
    images: {
      unoptimized: true,
    },
    async rewrites() {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:3003/api/:path*',
        },
      ]
    },
  }

  return nextConfig
}
