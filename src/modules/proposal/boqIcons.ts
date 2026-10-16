// src/modules/proposal/boqIcons.ts
// Contextual icon per BOQ material/category, from the lucide-react set the
// app already ships — no new dependency. Matched on the item name first
// (most specific) then the category, so a renamed BOS item still resolves to
// something sensible via its group.
import {
  Sun, Zap, BatteryCharging, Router, ShieldCheck, Cable, Plug, CloudLightning,
  ArrowDownToLine, Link2, Wrench, Waypoints, Building2, Footprints, Bird,
  Droplets, Package, Tag, LucideIcon,
} from "lucide-react";

const BY_NAME: [RegExp, LucideIcon][] = [
  [/module|panel/i, Sun],
  [/inverter/i, Zap],
  [/battery/i, BatteryCharging],
  [/logger/i, Router],
  [/acdb|dcdb|mcb|spd/i, ShieldCheck],
  [/mc4|connector/i, Plug],
  [/lightning|arrestor/i, CloudLightning],
  [/earthing|earth pit/i, ArrowDownToLine],
  [/cable|wire/i, Cable],
  [/lug|ferrule|gland/i, Link2],
  [/bolt|clamp|nut/i, Wrench],
  [/conduit|bend/i, Waypoints],
  [/tag|tape|tie/i, Tag],
  [/walkway/i, Footprints],
  [/bird/i, Bird],
  [/sprinkler|parnali|rainwater/i, Droplets],
  [/structure|bracing|ladder/i, Building2],
];

const BY_GROUP: Record<string, LucideIcon> = {
  "Main Equipment": Sun,
  "Protection Devices": ShieldCheck,
  "DC Side": Cable,
  "AC Side": Cable,
  "Earthing & Lightning": ArrowDownToLine,
  "Lugs & Terminals": Link2,
  "Hardware": Wrench,
  "Conduit & Accessories": Waypoints,
  "Structure": Building2,
  "Optional / Special": Package,
};

export function iconForItem(name: string, group: string): LucideIcon {
  for (const [pattern, icon] of BY_NAME) if (pattern.test(name)) return icon;
  return BY_GROUP[group] || Package;
}

export function iconForGroup(group: string): LucideIcon {
  return BY_GROUP[group] || Package;
}
