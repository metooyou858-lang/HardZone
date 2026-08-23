import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  assetPrefix: process.env.TELEGRAM_TEST_ASSET_PREFIX || undefined,
};

export default nextConfig;
