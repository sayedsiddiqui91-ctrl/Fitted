// Copies the pdf.js worker into /public so CV import can parse PDFs in the browser.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
try {
  const pkgDir = dirname(require.resolve("pdfjs-dist/package.json"));
  const candidates = ["build/pdf.worker.min.mjs", "build/pdf.worker.mjs"];
  const src = candidates.map((c) => join(pkgDir, c)).find((p) => existsSync(p));
  if (!src) throw new Error("pdf.js worker not found");
  mkdirSync("public", { recursive: true });
  copyFileSync(src, join("public", "pdf.worker.min.mjs"));
  console.log("✓ pdf.js worker copied to public/");
} catch (err) {
  console.warn("! Could not copy pdf.js worker:", err.message);
}
