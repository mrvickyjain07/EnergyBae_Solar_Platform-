// src/services/pdfClassification.test.ts
// Run with: npx tsx src/services/pdfClassification.test.ts
import assert from "node:assert/strict";
import { classifyPdfTextDensity } from "./pdfClassification";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${expected}, got ${actual}`);
  passed++;
  console.log(`  ok — ${label}`);
}

check("no pages -> scanned", classifyPdfTextDensity([]), "scanned");
check("all-zero pages -> scanned", classifyPdfTextDensity([0, 0, 0]), "scanned");
check("stray watermark text stays scanned", classifyPdfTextDensity([5, 3]), "scanned");
check("a real text layer -> digital", classifyPdfTextDensity([1200, 800]), "digital");
check("exactly at the threshold counts as digital", classifyPdfTextDensity([40]), "digital");
check("one char under the threshold stays scanned", classifyPdfTextDensity([39]), "scanned");
check("negative lengths never subtract from the total", classifyPdfTextDensity([-100, 10]), "scanned");

console.log(`\n${passed} checks passed.`);
