// src/modules/proposal/wirePriceUnits.ts
// Supplier price sheets quote rates per pack, not per metre — the Polycab
// sheet is headed "Rate Per/100 mtr", LAN drums are per 305 MTR, telephone
// coils per 90 mtr. wire_prices.price_per_m must hold a true per-metre rate,
// so every extracted price is divided by the length its price covers.
// Getting this wrong puts a 100x error into a customer quote.

export function normalizeToPerMetre(price: number, coversMetres: number | null | undefined): number {
  // No usable basis — treat the figure as already per-metre rather than
  // destroying it with a divide-by-zero/NaN.
  if (coversMetres == null || !Number.isFinite(coversMetres) || coversMetres <= 0) return price;
  return Math.round((price / coversMetres) * 100) / 100;
}
