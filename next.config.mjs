/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Portfolio media already lives in /public; serving it directly avoids
    // fragile runtime optimization for large and mixed-format artwork files.
    unoptimized: true,
  },
  experimental: {
    typedRoutes: true,
  },
};
export default nextConfig;
