/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't bundle the Postgres driver (and its ws/native-binding loader, which
  // references __dirname) — require it at runtime instead. Bundling it caused
  // "ReferenceError: __dirname is not defined" in the serverless function.
  experimental: {
    serverComponentsExternalPackages: [
      "@vercel/postgres",
      "@neondatabase/serverless",
      "ws",
    ],
  },
};

module.exports = nextConfig;
