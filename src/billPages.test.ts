// src/billPages.test.ts
// Run with: npx tsx src/billPages.test.ts
// combineBillParts is the one place a multi-photo / multi-file bill becomes
// the single file a scan sends — page order and page count must survive.
// (toJpeg / buildBillFile's shrink step need a browser canvas; not run here.)
import assert from "node:assert/strict";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { combineBillParts } from "./billPages";

let passed = 0;
async function check(label: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok — ${label}`);
}

const image = async (format: "jpeg" | "png", width: number, height: number) =>
  `data:image/${format};base64,` +
  (await sharp({ create: { width, height, channels: 3, background: { r: 220, g: 220, b: 220 } } })[format]().toBuffer()).toString("base64");

async function pdf(pageWidths: number[]) {
  const doc = await PDFDocument.create();
  for (const w of pageWidths) doc.addPage([w, 800]);
  return doc.saveAsBase64({ dataUri: true });
}

const pageWidths = async (dataUrl: string) =>
  (await PDFDocument.load(dataUrl.slice(dataUrl.indexOf(",") + 1))).getPages().map((p) => Math.round(p.getWidth()));

async function main() {
  await check("a single part is sent untouched (existing single-file flow)", async () => {
    const one = await image("jpeg", 300, 400);
    assert.equal(await combineBillParts([one]), one);
  });

  await check("front + back photos become one 2-page PDF", async () => {
    const out = await combineBillParts([await image("jpeg", 300, 400), await image("png", 400, 300)]);
    assert.ok(out.startsWith("data:application/pdf;base64,"));
    const pages = (await PDFDocument.load(out.slice(out.indexOf(",") + 1))).getPages();
    assert.equal(pages.length, 2);
    // A4-wide pages keep each photo's aspect: portrait then landscape — i.e. order kept.
    assert.ok(pages[0].getHeight() > pages[0].getWidth());
    assert.ok(pages[1].getHeight() < pages[1].getWidth());
  });

  await check("PDF pages are copied in place, in the chosen order", async () => {
    const out = await combineBillParts([await pdf([100, 200]), await image("jpeg", 300, 400), await pdf([300])]);
    assert.deepEqual(await pageWidths(out), [100, 200, 595, 300]);
  });

  await check("an unsupported page type is refused, not silently dropped", async () => {
    await assert.rejects(combineBillParts([await image("jpeg", 10, 10), "data:image/heic;base64,AAAA"]));
  });

  console.log(`\n${passed} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
