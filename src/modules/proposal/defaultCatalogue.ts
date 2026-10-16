// Proposal Maker — default price catalogue.
// Ships empty by design: panels, batteries, ACDB/DCDB lookups, and BOS unit
// prices all start blank so the Price Database reflects only this
// business's own real vendor data, entered via the "Add" controls in the
// Price Database tab — never pre-seeded sample pricing. Overhead charges
// (installation/transport/liaisoning/profit/GST/subsidy) keep sensible
// non-zero defaults since those are formula constants the BOQ engine needs
// to produce a usable quote, not vendor line items. (Inverters moved to
// their own inverter_prices table, see supabase/migrations/0006_inverter_prices.sql
// — no longer part of this catalogue.)

import { Catalogue } from "./types";

export const DEFAULT_CATALOGUE: Catalogue = {
  panels: [],
  acdb: [],
  dcdb: [],
  batteries: [],
  bos: {
    dcCable: 0, acCable: 0, earthCable6: 0, earthCable25: 0, earthPit: 0,
    mc4: 0, la: 0, mcb: 0,
    lugCuRing6: 0, lugCuPin6: 0, lugAlRing16: 0, lugCuRing4: 0,
    anchorBolt: 0, nutBolt: 0, tape: 0, cableTie: 0,
    conduit: 0, teeBend: 0, cableTag: 0, ferrule: 0,
    bracing: 0, walkway: 0, alStructure: 0, uClamp: 0, zClamp: 0,
    gland: 0, birdSpike: 0, jBolt: 0, parnali: 0, sprinkler: 0,
  },
  // Filled in below from BOS_ITEM_DEFS once that array is defined.
  bosNames: {} as Catalogue["bosNames"],
  customBOS: [],
  charges: { installation: 5500, transport: 3, liaisoning: 3500, profit: 15, gst: 8.9, subsidy: 78000 },
};

export const BOS_ITEM_DEFS: { key: keyof Catalogue["bos"]; label: string; unit: string; wireFallback?: boolean }[] = [
  // wireFallback: BOQTable's "Fill cable rates" button already prices these
  // from the Wire Prices tab (matched by size/cores/material) whenever a
  // match exists — this flat price is only the last-resort default when it
  // doesn't. Not a duplicate data-entry point; see matchWirePrice.ts.
  { key: "dcCable", label: "DC Cable", unit: "/MTS", wireFallback: true },
  { key: "acCable", label: "AC Cable", unit: "/MTS", wireFallback: true },
  { key: "earthCable6", label: "Earthing Cable 6sq.mm", unit: "/MTS", wireFallback: true },
  { key: "earthCable25", label: "Earthing Cable 25sq.mm", unit: "/MTS", wireFallback: true },
  { key: "earthPit", label: "Earthing Pit", unit: "/Nos." },
  { key: "mc4", label: "MC4 Connectors", unit: "/Pair" },
  { key: "la", label: "Lightning Arrestor", unit: "/Nos." },
  { key: "mcb", label: "MCB at LT Panel", unit: "/Nos." },
  { key: "lugCuRing6", label: "Lug Cu Ring 6sq.mm", unit: "/Nos." },
  { key: "lugCuPin6", label: "Lug Cu Pin 6sq.mm", unit: "/Nos." },
  { key: "lugAlRing16", label: "Lug Al Ring 16sq.mm", unit: "/Nos." },
  { key: "lugCuRing4", label: "Lug Cu Ring 4sq.mm", unit: "/Nos." },
  { key: "anchorBolt", label: "Anchor Bolt M10", unit: "/Nos." },
  { key: "nutBolt", label: "Nut Bolt M8/M6 GI", unit: "/Nos." },
  { key: "tape", label: "Electrical Tape", unit: "/Nos." },
  { key: "cableTie", label: "Cable Ties", unit: "/Packet" },
  { key: "conduit", label: "Conduit PVC 25mm", unit: "/MTS" },
  { key: "teeBend", label: "Tee Bend 25mm", unit: "/Nos." },
  { key: "cableTag", label: "Cable Tags", unit: "/Nos." },
  { key: "ferrule", label: "Ferrules 8mm", unit: "/Set" },
  { key: "bracing", label: "Ladder & Cross Bracing", unit: "/MTS" },
  { key: "walkway", label: "Walkway", unit: "/MTS" },
  { key: "alStructure", label: "Al Structure (over shed)", unit: "/kW" },
  { key: "uClamp", label: "U-Clamp SS-304", unit: "/Nos." },
  { key: "zClamp", label: "Z-Clamp SS-304", unit: "/Nos." },
  { key: "gland", label: "Glands PVC 32mm", unit: "/Nos." },
  { key: "birdSpike", label: "Bird Spikes", unit: "/MTS" },
  { key: "jBolt", label: "J-Bolt M8 SS-304", unit: "/Nos." },
  { key: "parnali", label: "Parnali / Rainwater Channel", unit: "/Nos." },
  { key: "sprinkler", label: "Sprinkler System", unit: "/kW" },
];

for (const { key, label } of BOS_ITEM_DEFS) {
  DEFAULT_CATALOGUE.bosNames[key] = label;
}

// v2: bumped so any browser that already cached the old sample-seeded
// catalogue (Adani/Deye/UTL demo rows) picks up the new empty default
// instead of resurrecting the removed sample data from localStorage.
export const LOCALSTORAGE_CATALOGUE_KEY = "eb_proposal_catalogue_v2";
export const LOCALSTORAGE_DRAFT_KEY = "eb_proposal_draft_v1";
export const LOCALSTORAGE_COUNTER_KEY = "eb_proposal_counter_v1";
