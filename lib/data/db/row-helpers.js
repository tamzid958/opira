// Pure helpers used by the DB row mappers. Mirror the corresponding
// internal helpers in `lib/openproject/mappers.js` exactly so DB-mode
// outputs are byte-identical to API-mode outputs for the same input.

import { hashIndex, initialsOf as _initialsOf } from "@/lib/openproject/mappers";

const PALETTE = [
  "#2563eb",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#16a34a",
  "#ea580c",
  "#0d9488",
  "#b91c1c",
  "#f97316",
];

export function colorFor(seed) {
  return PALETTE[hashIndex(String(seed || ""), PALETTE.length)];
}

export const initialsOf = _initialsOf;
