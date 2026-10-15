import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Portfolio media already lives in /public; serving it directly avoids
    // fragile runtime optimization for large and mixed-format artwork files.
    unoptimized: true,
  },
  typedRoutes: true,
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/workspace/documents": [
      "./node_modules/pdf-parse/dist/pdf-parse/*/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      // PDF.js loads its DOM geometry polyfills through a dynamic native import.
      "./node_modules/@napi-rs/canvas*/**/*",
    ],
  },
};
export default (phase) => ({
  ...nextConfig,
  // A production build must not overwrite the running preview's manifests.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
});
