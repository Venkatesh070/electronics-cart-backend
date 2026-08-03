import { TaxRule } from "../models/TaxRule";
import { ShippingZone } from "../models/ShippingZone";

export async function computeShippingFee(state: string, subtotal: number): Promise<number> {
  const zone = await ShippingZone.findOne({ regions: state, active: true });
  if (!zone) return 0;
  if (zone.freeShippingThreshold && subtotal >= zone.freeShippingThreshold) return 0;
  return zone.baseRate;
}

export async function computeTax(state: string, categoryId: string | undefined, amount: number): Promise<number> {
  const rule =
    (categoryId && (await TaxRule.findOne({ region: state, category: categoryId, active: true }))) ||
    (await TaxRule.findOne({ region: state, category: { $exists: false }, active: true }));
  if (!rule) return 0;
  return rule.priceMode === "exclusive" ? (amount * rule.ratePercent) / 100 : 0;
}
