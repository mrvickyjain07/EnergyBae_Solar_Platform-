// Run: npx tsx src/uploadLimits.test.ts
import assert from "node:assert/strict";
import {
  MAX_BILL_BYTES, MAX_REQUEST_BYTES, base64Length, dataUrlBytes, dataUrlMime,
  decideUpload, isAcceptedBillMime,
} from "./uploadLimits";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, label);
  passed++;
}

// The whole point of the limit: a max-size file still fits Vercel's body cap
// once base64-encoded and wrapped in JSON (prefix + field names ≈ < 1 KB).
check("max file fits request cap", base64Length(MAX_BILL_BYTES) + 1024 < MAX_REQUEST_BYTES, true);
check("request cap below Vercel 4.5 MB", MAX_REQUEST_BYTES < 4.5 * 1024 * 1024, true);

const sample = Buffer.from("hello bill!!"); // 12 bytes, no padding
check("dataUrlBytes no padding", dataUrlBytes(`data:image/png;base64,${sample.toString("base64")}`), 12);
check("dataUrlBytes 1 pad", dataUrlBytes(`data:image/png;base64,${Buffer.from("hello bill!").toString("base64")}`), 11);
check("dataUrlBytes 2 pad", dataUrlBytes(`data:image/png;base64,${Buffer.from("hello bill").toString("base64")}`), 10);
check("dataUrlBytes empty", dataUrlBytes("data:image/png;base64,"), 0);

check("mime pdf", dataUrlMime("data:application/pdf;base64,AAAA"), "application/pdf");
check("mime missing", dataUrlMime("AAAA"), null);
check("accept jpeg", isAcceptedBillMime("image/jpeg"), true);
check("reject html", isAcceptedBillMime("text/html"), false);
check("reject null", isAcceptedBillMime(null), false);

const MB = 1024 * 1024;
check("small pdf sent", decideUpload({ type: "application/pdf", name: "a.pdf", size: 1 * MB }), { action: "send" });
check("small jpg sent", decideUpload({ type: "image/jpeg", name: "a.jpg", size: 2 * MB }), { action: "send" });
check("big jpg compressed", decideUpload({ type: "image/jpeg", name: "a.jpg", size: 8 * MB }), { action: "compress" });
check("big pdf rejected (never re-encoded)", decideUpload({ type: "application/pdf", name: "a.pdf", size: 8 * MB }).action, "reject");
check("pdf by extension rejected", decideUpload({ type: "", name: "BILL.PDF", size: 8 * MB }).action, "reject");
check("empty rejected", decideUpload({ type: "image/png", name: "a.png", size: 0 }).action, "reject");

console.log(`\n${passed} passed`);
