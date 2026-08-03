import { Request, Response } from "express";
import { ShippingZone } from "../models/ShippingZone";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { computeShippingFee } from "../utils/orderPricing";

/**
 * Delivery estimate by state/pincode for PDP checkout preview.
 * Zones are matched on `regions` (state codes / city names / pincode prefixes).
 */
export const estimateDelivery = asyncHandler(async (req: Request, res: Response) => {
  const { state, pincode, subtotal = "0" } = req.query as Record<string, string>;
  if (!state && !pincode) throw new ApiError(400, "state or pincode is required");

  const region = state || pincode;
  const zone =
    (await ShippingZone.findOne({ regions: region, active: true })) ||
    (pincode
      ? await ShippingZone.findOne({
          regions: { $in: [pincode.slice(0, 3), pincode.slice(0, 2)] },
          active: true,
        })
      : null);

  if (!zone) {
    return res.json({
      success: true,
      data: {
        available: false,
        message: "Delivery not available for this location yet",
      },
    });
  }

  const fee = await computeShippingFee(zone.regions[0] || region!, Number(subtotal) || 0);
  const minDays = 2;
  const maxDays = 7;
  const etaFrom = new Date();
  etaFrom.setDate(etaFrom.getDate() + minDays);
  const etaTo = new Date();
  etaTo.setDate(etaTo.getDate() + maxDays);

  res.json({
    success: true,
    data: {
      available: true,
      zone: zone.name,
      shippingFee: fee,
      freeShippingThreshold: zone.freeShippingThreshold,
      courierPartner: zone.courierPartner,
      estimatedDelivery: { from: etaFrom, to: etaTo },
      expressAvailable: Boolean(zone.courierPartner),
    },
  });
});

export const listPublicShippingZones = asyncHandler(async (_req: Request, res: Response) => {
  const zones = await ShippingZone.find({ active: true }).select("-__v");
  res.json({ success: true, data: zones });
});
