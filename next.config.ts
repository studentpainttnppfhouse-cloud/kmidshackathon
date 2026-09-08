import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    /**
     * Server Actions receive form posts from the Render domain — and, since
     * attachments went into the database, the files themselves.
     *
     * This is the outer ceiling, not the limit people meet: `MAX_UPLOAD_BYTES`
     * in src/lib/attachments.ts is what the upload actions enforce and what
     * every form says out loud. This number sits above the highest value
     * MAX_UPLOAD_MB is allowed to take (20 MB) plus multipart overhead, so a
     * file that is over the real limit comes back as a sentence naming the
     * file rather than as a framework error with nothing useful in it.
     */
    serverActions: { bodySizeLimit: "24mb" },
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
