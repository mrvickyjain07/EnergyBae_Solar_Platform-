// src/modules/proposal/matchWirePrice.test.ts
// Run with: npx tsx src/modules/proposal/matchWirePrice.test.ts
import assert from "node:assert/strict";
import { matchWirePrice, parseCableSpec, WireCandidate } from "./matchWirePrice";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const w = (internal_name: string, size_sqmm: number, cores: number, material: string | null, price_per_m: number): WireCandidate =>
  ({ internal_name, size_sqmm, cores, material, price_per_m });

const stock: WireCandidate[] = [
  w("Cu 1C x 4", 4, 1, "Cu", 40),
  w("Cu 1C x 6", 6, 1, "Cu", 60),
  w("Cu 1C x 25", 25, 1, "Cu", 250),
  w("Cu 2C x 4", 4, 2, "Cu", 90),
  w("Cu 3C x 4", 4, 3, "Cu", 130),
  w("Al 4C x 4", 4, 4, "Al", 70),
  w("Cu 1C x 10", 10, 1, "Cu", 100),
];

check("exact size + cores + material wins", matchWirePrice(stock, { size: 6, cores: 1, material: "Cu" })?.internal_name, "Cu 1C x 6");
check("cores must match exactly", matchWirePrice(stock, { size: 4, cores: 3, material: "Cu" })?.internal_name, "Cu 3C x 4");
check("material is honoured", matchWirePrice(stock, { size: 4, cores: 4, material: "Al" })?.internal_name, "Al 4C x 4");

// Conductor sizing is a safety property: substituting a SMALLER conductor
// than the design calls for under-rates the circuit. When there is no exact
// size, step UP to the next available size, never down.
check("no exact size steps up, never down", matchWirePrice(stock, { size: 5, cores: 1, material: "Cu" })?.internal_name, "Cu 1C x 6");
check("steps up to the nearest larger size", matchWirePrice(stock, { size: 7, cores: 1, material: "Cu" })?.internal_name, "Cu 1C x 10");
check("never returns an undersized conductor", matchWirePrice(stock, { size: 30, cores: 1, material: "Cu" }), null);

// A wrong core count is never an acceptable substitute.
check("no match on an unavailable core count", matchWirePrice(stock, { size: 4, cores: 5, material: "Cu" }), null);
check("wrong material is not substituted", matchWirePrice(stock, { size: 6, cores: 1, material: "Al" }), null);

// Real supplier sheets often don't state the conductor material per row — the
// Polycab rate matrix leaves it blank on 177 of 181 rows. An UNKNOWN material
// on the catalogue side must not be read as a mismatch, or nothing matches.
{
  const unstated = [w("6 sqmm 1 core", 6, 1, null, 62), w("25 sqmm 1 core", 25, 1, null, 255)];
  check("candidate with unknown material still matches", matchWirePrice(unstated, { size: 6, cores: 1, material: "Cu" })?.internal_name, "6 sqmm 1 core");
  check("unknown material matches an Al spec too", matchWirePrice(unstated, { size: 25, cores: 1, material: "Al" })?.internal_name, "25 sqmm 1 core");
  // But a row that explicitly states the OTHER material is still rejected.
  check("explicit wrong material still loses to nothing", matchWirePrice([w("alu", 6, 1, "Al", 30)], { size: 6, cores: 1, material: "Cu" }), null);
  // An exact material match is preferred over an unknown one at the same size.
  const mixed = [w("unknown", 6, 1, null, 62), w("stated Cu", 6, 1, "Cu", 70)];
  check("a stated matching material outranks an unknown one", matchWirePrice(mixed, { size: 6, cores: 1, material: "Cu" })?.internal_name, "stated Cu");
}

// Extraction has historically written the *string* "null" into the material
// column rather than a real null, so "unknown" arrives in several disguises.
// Treat them all as unknown instead of as a material named "null".
for (const blank of ["null", "NULL", "none", "na", "-", "", "  "]) {
  const rows = [w(`blank:${blank}`, 6, 1, blank, 62)];
  check(`material ${JSON.stringify(blank)} is treated as unknown`, matchWirePrice(rows, { size: 6, cores: 1, material: "Cu" })?.internal_name, `blank:${blank}`);
}

// Unknown material shouldn't block a match — size and cores still decide.
check("null material matches on size and cores", matchWirePrice(stock, { size: 25, cores: 1, material: null })?.internal_name, "Cu 1C x 25");

// Rows with no usable size can't be reasoned about and must be ignored.
check("rows missing a size are skipped", matchWirePrice([w("no size", NaN, 1, "Cu", 10)], { size: 4, cores: 1, material: "Cu" }), null);
check("empty catalogue yields no match", matchWirePrice([], { size: 4, cores: 1, material: "Cu" }), null);

// Ties on size+cores+material go to the cheaper rate.
{
  const dupes = [w("pricey", 4, 1, "Cu", 80), w("cheap", 4, 1, "Cu", 45)];
  check("cheapest wins a tie", matchWirePrice(dupes, { size: 4, cores: 1, material: "Cu" })?.internal_name, "cheap");
}

// ── parseCableSpec: reads geometry from the specs calcBOQ() actually emits ──
check("DC cable spec", parseCableSpec("2C×1.5 sq.mm XLPO EN50618 FRLS"), { size: 1.5, cores: 2, material: null });
check("armoured AC cable spec reads Al", parseCableSpec("1.1kV Al.XLPE 4C×4sq.mm FRLS Armoured"), { size: 4, cores: 4, material: "Al" });
check("flexible AC cable spec reads Cu", parseCableSpec("3C×4sq.mm Cu Flexible"), { size: 4, cores: 3, material: "Cu" });
check("earthing 6 sqmm spec", parseCableSpec("Cu FRLS 1C×6sq.mm IS694"), { size: 6, cores: 1, material: "Cu" });
check("earthing 25 sqmm spec", parseCableSpec("Cu FRLS 1C×25sq.mm IS694"), { size: 25, cores: 1, material: "Cu" });
check("plain 'x' separator is accepted", parseCableSpec("2Cx6sq.mm"), { size: 6, cores: 2, material: null });
// A "3.5 core" cable (3 full conductors + reduced neutral) is a real,
// distinct construction from a 4-core cable — must not round to 4.
check("fractional 3.5 core spec is preserved", parseCableSpec("3.5C×25sq.mm Al Armoured"), { size: 25, cores: 3.5, material: "Al" });
check("3.5 core never matches a 4-core candidate", matchWirePrice([w("Al 4C x 25", 25, 4, "Al", 500)], { size: 25, cores: 3.5, material: "Al" }), null);
check("non-cable rows return null", parseCableSpec("Chemical IS3043 17.2mm Cu-rod"), null);
check("empty spec returns null", parseCableSpec(""), null);

console.log(`\n${passed} checks passed.`);
