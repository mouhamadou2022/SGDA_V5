import type { NextConfig } from 'next'
import path from 'path'

/**
 * next.config.ts — SGDA V5
 * ✅ R4 : Fichier de config unique
 */
const nextConfig: NextConfig = {
  transpilePackages: ['leaflet'],
  serverExternalPackages: ['resend', 'twilio'],

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/**',
      },
    ],
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({ resend: 'commonjs resend', twilio: 'commonjs twilio' });
    }
    return config;
  },

  // Fix Turbopack workspace root detection (multiple lockfiles in parent dirs)
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Redirect /dashboard → / (CDC: navigation via Zustand activeModule, pas via URL)
  async redirects() {
    return [
      {
        source: '/dashboard',
        destination: '/',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
