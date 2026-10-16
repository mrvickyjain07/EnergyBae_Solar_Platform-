// src/encoding.test.ts
// Run with: npx tsx src/encoding.test.ts
// Fails on mojibake: UTF-8 text that was once re-saved as Windows-1252, which
// is how ProposalForm.tsx came to show garbled dashes and rupee signs until
// 2026-10-12. Static, like tenantScope.test.ts — the bytes are in the source,
// so that is where to catch them. (Code points, not literals, so this file can't match itself.)
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Lead byte of a 2/3-byte UTF-8 sequence read as cp1252 (C2/C3/E2), then a cp1252 continuation char; or U+FFFD.
const LEAD = new Set([0xc2, 0xc3, 0xe2]);
const CONT = new Set([...Array.from({ length: 0x40 }, (_, i) => 0x80 + i),
  0x152, 0x153, 0x160, 0x161, 0x178, 0x17d, 0x17e, 0x192, 0x2c6, 0x2dc, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e,
  0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122]);
const MOJIBAKE = { test: (s: string) => [...s].some((ch, i, a) => ch.codePointAt(0) === 0xfffd || (LEAD.has(ch.codePointAt(0)!) && i + 1 < a.length && CONT.has(a[i + 1].codePointAt(0)!))) };

const files: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css|html)$/.test(name)) files.push(p);
  }
})(join(process.cwd(), "src"));

const bad = files.flatMap((f) =>
  readFileSync(f, "utf8").split("\n").flatMap((line, i) => (MOJIBAKE.test(line) ? [`${f}:${i + 1}: ${line.trim().slice(0, 80)}`] : [])));
assert.deepStrictEqual(bad, [], `Mojibake found — re-save these files as UTF-8:\n${bad.join("\n")}`);
console.log(`${files.length} files checked, no mojibake. 1 passed`);
