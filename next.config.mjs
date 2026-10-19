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
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/workspace/documents": [
      "./node_modules/pdf-parse/dist/pdf-parse/*/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      // PDF.js loads its DOM geometry polyfills through a dynamic native import.
      "./node_modules/@napi-rs/canvas*/**/*",
    ],
    // Re-reading an imported file runs the PDF parser again.
    "/api/workspace/documents/[id]": [
      "./node_modules/pdf-parse/dist/pdf-parse/*/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/@napi-rs/canvas*/**/*",
    ],
    // OCR renders pages to images, so it needs the same PDF worker and canvas files.
    "/api/workspace/documents/[id]/enrich": [
      "./node_modules/pdf-parse/dist/pdf-parse/*/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/@napi-rs/canvas*/**/*",
    ],
    "/api/workspace/boards/[id]/pdf": [
      "./node_modules/pdf-parse/dist/pdf-parse/*/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/@napi-rs/canvas*/**/*",
    ],
    "/api/workspace/documents/[id]/ocr": [
      "./node_modules/pdf-parse/dist/pdf-parse/*/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/@napi-rs/canvas*/**/*",
    ],
  },
};
export default (phase) => ({
  ...nextConfig,
  // A production build must not overwrite the running preview's manifests.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
});
