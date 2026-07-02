/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Legislator photos served from the unitedstates project + Congress.gov.
    remotePatterns: [
      { protocol: "https", hostname: "unitedstates.github.io" },
      { protocol: "https", hostname: "theunitedstates.io" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
