// src/services/billEnhancement.test.ts
// Run with: npx tsx src/services/billEnhancement.test.ts
// Covers the deterministic sharp/pdf-lib pipeline only — assessDocumentQuality
// makes a live Gemini call and is exercised manually via the UI instead,
// matching how the rest of this repo's tests avoid live API calls.
import assert from "node:assert/strict";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { enhancePageBuffer, assemblePagesIntoPdf } from "./billEnhancement";

let passed = 0;
async function check(label: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok — ${label}`);
}

function makeTestPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } },
  })
    .png()
    .toBuffer();
}

async function main() {
  await check("enhancePageBuffer returns a valid PNG", async () => {
    const input = await makeTestPng(400, 300);
    const output = await enhancePageBuffer(input);
    const meta = await sharp(output).metadata();
    assert.equal(meta.format, "png");
  });

  await check("enhancePageBuffer upscales pages below the minimum dimension", async () => {
    const input = await makeTestPng(400, 300); // short side 300 < 1500
    const output = await enhancePageBuffer(input);
    const meta = await sharp(output).metadata();
    assert.ok((meta.height || 0) >= 1500, `expected upscaled height >= 1500, got ${meta.height}`);
  });

  await check("enhancePageBuffer leaves already-large pages at their own size", async () => {
    const input = await makeTestPng(2000, 1600);
    const output = await enhancePageBuffer(input);
    const meta = await sharp(output).metadata();
    assert.equal(meta.width, 2000);
    assert.equal(meta.height, 1600);
  });

  await check("assemblePagesIntoPdf produces one PDF page per input image", async () => {
    const pages = [await makeTestPng(300, 400), await makeTestPng(300, 400), await makeTestPng(300, 400)];
    const pdfBuffer = await assemblePagesIntoPdf(pages);
    const doc = await PDFDocument.load(pdfBuffer);
    assert.equal(doc.getPageCount(), 3);
  });

  console.log(`\n${passed} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
