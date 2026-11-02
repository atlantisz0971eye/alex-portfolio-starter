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
/**
 * The Workspace shows text the model wrote after reading mail and documents, so its pages may only load from this site:
 * nothing it renders can reach another server. The portfolio embeds YouTube, Vimeo and NetEase players, so it only gets
 * the headers that cost nothing.
 */
function workspacePolicy(dev) {
  return [
    "default-src 'self'",
    // Next inlines its bootstrap scripts; PDF.js compiles WebAssembly; dev mode's refresh needs eval.
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://api.fontshare.com",
    "font-src 'self' data: https://api.fontshare.com https://cdn.fontshare.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    // Uploads go straight from the browser to Vercel Blob.
    `connect-src 'self' https://vercel.com https://*.blob.vercel-storage.com${dev ? " ws:" : ""}`,
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const baseHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

export default (phase) => ({
  ...nextConfig,
  async headers() {
    // When several rules match, the later one wins for the same header, so these replace the site-wide values.
    const workspace = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Content-Security-Policy", value: workspacePolicy(phase === PHASE_DEVELOPMENT_SERVER) },
    ];
    return [
      { source: "/:path*", headers: baseHeaders },
      { source: "/workspace", headers: workspace },
      { source: "/workspace/:path*", headers: workspace },
      { source: "/api/workspace/:path*", headers: workspace },
    ];
  },
  // A production build must not overwrite the running preview's manifests.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
});
