import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Pages fetch their own data in the browser, so the server part of a tab can be
    // reused for a little while: going back to a tab doesn't wait on the server.
    staleTimes: { dynamic: 30 },
  },
  // Old bookmarks from before the Kitchen / Me tabs.
  async redirects() {
    return [{ source: "/private", destination: "/me", permanent: false }];
  },
};

export default nextConfig;
