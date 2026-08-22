import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Server Actions receive form posts from the Render domain.
    serverActions: { bodySizeLimit: "2mb" },
  },

  /**
   * Security headers live in `src/middleware.ts`, not here.
   *
   * The Content-Security-Policy carries a per-request nonce, which a static
   * config block cannot generate — and having two places that both set headers
   * is how one of them ends up quietly overriding the other. What stays here is
   * the one rule middleware does not run for: Next's own immutable static
   * assets, which are excluded from the matcher for latency.
   */
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
