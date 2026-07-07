/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Card art is loaded from publisher-sanctioned CDNs (Scryfall, pokemontcg.io,
  // etc.). We use plain <img> tags rather than next/image so no per-host image
  // config is required and any sanctioned CDN works out of the box.
  eslint: {
    // Lint is available via `npm run lint`; don't fail production builds on it.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
