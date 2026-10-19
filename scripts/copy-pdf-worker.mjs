// The original-PDF view runs pdf.js in the browser. Its library and worker are served from /public (not bundled), so they
// always match the installed version and stay out of the app bundle.
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
copyFileSync("node_modules/pdfjs-dist/legacy/build/pdf.min.mjs", "public/pdf.min.mjs");
