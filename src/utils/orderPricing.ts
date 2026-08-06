import { TaxRule } from "../models/TaxRule";
import { ShippingZone } from "../models/ShippingZone";
import { getCheckoutDeliveryOptions, isShiprocketConfigured } from "../services/shiprocket";

async function findShippingZone(state: string) {
  const key = String(state || "").trim();
  return (
    (await ShippingZone.findOne({ regions: key, active: true })) ||
    (await ShippingZone.findOne({
      regions: { $in: [key, key.toLowerCase(), "ALL", "India", "PAN-INDIA"] },
      active: true,
    }))
  );
}

export async function computeShippingFee(state: string, subtotal: number): Promise<number> {
  const zone = await findShippingZone(state);
  if (!zone) {
    // Pan-India default (matches /shipping/estimate)
    return subtotal >= 499 ? 0 : 49;
  }
  if (zone.freeShippingThreshold != null && subtotal >= zone.freeShippingThreshold) return 0;
  return zone.baseRate;
}

/** True only for a real, admin-created zone's free-shipping promo — not the synthetic pan-India default. */
export async function isZoneFreeShipping(state: string, subtotal: number): Promise<boolean> {
  const zone = await findShippingZone(state);
  return Boolean(zone && zone.freeShippingThreshold != null && subtotal >= zone.freeShippingThreshold);
}

export type ShippingResolution = {
  fee: number;
  courier?: string;
  source: "shiprocket" | "zone" | "zone-free";
};

/**
 * Live Shiprocket courier rate for the chosen delivery slot. An admin-configured
 * ShippingZone's free-shipping threshold is a deliberate promo and always wins over
 * live rates; the synthetic pan-India default (no zone configured) does not — it only
 * applies as the final fallback when Shiprocket can't quote (not configured, pincode
 * unserviceable, API error), so checkout is never blocked by a rate lookup.
 */
export async function resolveShippingFee(opts: {
  state: string;
  postalCode?: string;
  subtotal: number;
  qty: number;
  deliverySlot?: string;
  cod: boolean;
}): Promise<ShippingResolution> {
  const { state, postalCode, subtotal, qty, deliverySlot, cod } = opts;

  if (await isZoneFreeShipping(state, subtotal)) return { fee: 0, source: "zone-free" };

  if (postalCode && isShiprocketConfigured()) {
    try {
      const quotes = await getCheckoutDeliveryOptions(postalCode, qty, cod);
      const wanted = deliverySlot === "express" ? "express" : "standard";
      const quote = quotes.find((q) => q.slot === wanted) || quotes[0];
      if (quote) return { fee: quote.rate, courier: quote.courierName, source: "shiprocket" };
    } catch {
      // Fall through to the zone-based rate below.
    }
  }

  const fee = await computeShippingFee(state, subtotal);
  return { fee, source: "zone" };
}

export async function computeTax(state: string, categoryId: string | undefined, amount: number): Promise<number> {
  const rule =
    (categoryId && (await TaxRule.findOne({ region: state, category: categoryId, active: true }))) ||
    (await TaxRule.findOne({ region: state, category: { $exists: false }, active: true }));
  if (!rule) return 0;
  return rule.priceMode === "exclusive" ? (amount * rule.ratePercent) / 100 : 0;
}
