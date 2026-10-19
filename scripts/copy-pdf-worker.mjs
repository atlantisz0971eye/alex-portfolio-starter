// The original-PDF view runs pdf.js in the browser. Its library, worker and data files are served from /public (not
// bundled), so they always match the installed version and stay out of the app bundle. Scanned books need the image
// decoders (wasm) and some PDFs need the font and character-map data, or their pages draw blank.
import { copyFileSync, cpSync, mkdirSync, rmSync } from "node:fs";
mkdirSync("public", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
copyFileSync("node_modules/pdfjs-dist/legacy/build/pdf.min.mjs", "public/pdf.min.mjs");
rmSync("public/pdfjs", { recursive: true, force: true });
for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) cpSync(`node_modules/pdfjs-dist/${folder}`, `public/pdfjs/${folder}`, { recursive: true });
