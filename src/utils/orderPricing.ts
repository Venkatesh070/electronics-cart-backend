import { TaxRule } from "../models/TaxRule";
import { ShippingZone } from "../models/ShippingZone";

export async function computeShippingFee(state: string, subtotal: number): Promise<number> {
  const key = String(state || "").trim();
  const zone =
    (await ShippingZone.findOne({ regions: key, active: true })) ||
    (await ShippingZone.findOne({
      regions: { $in: [key, key.toLowerCase(), "ALL", "India", "PAN-INDIA"] },
      active: true,
    }));
  if (!zone) {
    // Pan-India default (matches /shipping/estimate)
    return subtotal >= 499 ? 0 : 49;
  }
  if (zone.freeShippingThreshold != null && subtotal >= zone.freeShippingThreshold) return 0;
  return zone.baseRate;
}

export async function computeTax(state: string, categoryId: string | undefined, amount: number): Promise<number> {
  const rule =
    (categoryId && (await TaxRule.findOne({ region: state, category: categoryId, active: true }))) ||
    (await TaxRule.findOne({ region: state, category: { $exists: false }, active: true }));
  if (!rule) return 0;
  return rule.priceMode === "exclusive" ? (amount * rule.ratePercent) / 100 : 0;
}
