import { cents } from "./money";

// PVP includes tax; acquisition cost is entered WITHOUT tax. Work in cents so
// the base plus VAT always equals the price actually charged to the customer.
export function productPricing(price: unknown, cost: unknown, taxRate: unknown) {
  const gross = cents(price), rate = Math.round(Number(taxRate) * 100);
  const base = Math.round(gross * 10000 / (10000 + rate));
  const margin = base - cents(cost);
  return { baseAmount: base / 100, taxAmount: (gross - base) / 100, marginAmount: margin / 100,
    marginPercent: base > 0 ? Math.round(margin / base * 10000) / 100 : null };
}
