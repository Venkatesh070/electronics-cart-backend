import { Request, Response } from "express";
import { ShippingZone } from "../models/ShippingZone";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import {
  addDays,
  formatDeliveryDay,
  isValidIndianPincode,
  lookupPincode,
} from "../utils/pincodeIndia";

const DEFAULT_BASE_RATE = 49;
const DEFAULT_FREE_THRESHOLD = 499;

type ZoneDoc = {
  name: string;
  regions: string[];
  baseRate: number;
  freeShippingThreshold?: number;
  courierPartner?: string;
};

async function findZoneForPincode(pincode: string, state: string): Promise<ZoneDoc | null> {
  const candidates = [
    pincode,
    pincode.slice(0, 3),
    pincode.slice(0, 2),
    state,
    state.toLowerCase(),
    "ALL",
    "IN",
    "India",
    "PAN-INDIA",
  ];

  const zones = await ShippingZone.find({ active: true }).lean();
  if (!zones.length) return null;

  const norm = (s: string) => String(s || "").trim().toLowerCase();
  const candSet = new Set(candidates.map(norm).filter(Boolean));

  for (const zone of zones) {
    const regions = (zone.regions || []).map(norm);
    if (regions.some((r) => candSet.has(r))) return zone as ZoneDoc;
  }

  // Prefix match: zone region "500" matches pincode 500038
  for (const zone of zones) {
    for (const r of zone.regions || []) {
      const region = String(r).trim();
      if (/^\d{2,6}$/.test(region) && pincode.startsWith(region)) return zone as ZoneDoc;
    }
  }

  return null;
}

/**
 * Flipkart-style delivery estimate by pincode.
 * Returns ETA, fee / free delivery, COD, and location label.
 */
export const estimateDelivery = asyncHandler(async (req: Request, res: Response) => {
  const { state, pincode: pinRaw, subtotal = "0", weight } = req.query as Record<string, string>;
  const pincode = String(pinRaw || "").trim();

  if (!state && !pincode) throw new ApiError(400, "state or pincode is required");

  if (pincode && !isValidIndianPincode(pincode)) {
    return res.json({
      success: true,
      data: {
        available: false,
        serviceable: false,
        message: "Please enter a valid 6-digit pincode",
      },
    });
  }

  const info = pincode ? lookupPincode(pincode) : null;
  const resolvedState = state || info?.state || "";
  const zone = pincode
    ? await findZoneForPincode(pincode, resolvedState)
    : await ShippingZone.findOne({
        regions: { $in: [resolvedState, resolvedState.toLowerCase(), "ALL", "India"] },
        active: true,
      });

  const cartValue = Number(subtotal) || 0;
  const baseRate = zone?.baseRate ?? DEFAULT_BASE_RATE;
  const freeAt = zone?.freeShippingThreshold ?? DEFAULT_FREE_THRESHOLD;
  const shippingFee = cartValue >= freeAt ? 0 : baseRate;
  const freeDelivery = shippingFee === 0;

  const isMetro = info?.isMetro ?? false;
  const minDays = isMetro ? 1 : 3;
  const maxDays = isMetro ? 2 : 5;
  const etaDate = addDays(new Date(), minDays);
  const etaLatest = addDays(new Date(), maxDays);
  const deliveryLabel = formatDeliveryDay(etaDate);

  const city = info?.city || resolvedState || "your area";
  const locationLabel = info
    ? `${info.city}, ${pincode}`
    : resolvedState
      ? resolvedState
      : pincode;

  // COD: available for most serviceable pins when cart is under ₹50k
  const codAvailable = cartValue < 50000;

  const packageWeight = Number(weight) || 1;
  const expressFee = Math.max(99, Math.round(baseRate * 2));
  const expressEta = formatDeliveryDay(addDays(new Date(), isMetro ? 1 : 2));

  res.json({
    success: true,
    data: {
      available: true,
      serviceable: true,
      pincode: pincode || undefined,
      city: info?.city,
      state: info?.state || resolvedState,
      locationLabel,
      zone: zone?.name || "Pan India",
      courierPartner: zone?.courierPartner || "Standard Courier",
      shippingFee,
      freeDelivery,
      freeShippingThreshold: freeAt,
      amountForFreeDelivery: freeDelivery ? 0 : Math.max(0, freeAt - cartValue),
      codAvailable,
      estimatedDelivery: {
        from: etaDate.toISOString(),
        to: etaLatest.toISOString(),
        label: deliveryLabel,
        minDays,
        maxDays,
      },
      options: [
        {
          id: "standard",
          label: "Standard Delivery",
          fee: shippingFee,
          free: freeDelivery,
          eta: deliveryLabel,
          etaRange: `${minDays}-${maxDays} days`,
        },
        {
          id: "express",
          label: "Express Delivery",
          fee: expressFee,
          free: false,
          eta: expressEta,
          etaRange: isMetro ? "1 day" : "1-2 days",
          available: packageWeight <= 30,
        },
      ],
      message: freeDelivery
        ? `Delivery by ${deliveryLabel} · Free Delivery`
        : `Delivery by ${deliveryLabel}`,
    },
  });
});

export const listPublicShippingZones = asyncHandler(async (_req: Request, res: Response) => {
  const zones = await ShippingZone.find({ active: true }).select("-__v");
  res.json({ success: true, data: zones });
});
