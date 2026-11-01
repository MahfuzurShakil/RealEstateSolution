import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * BUYER-PORTAL-PLAN.md §5 — the Customer Portal serves buyers as well as
   * investors, so it moved from /investor to /customer. Old links and
   * bookmarks land on the same page.
   */
  redirects() {
    return [
      { source: "/investor", destination: "/customer", permanent: false },
      { source: "/investor/:path*", destination: "/customer/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
