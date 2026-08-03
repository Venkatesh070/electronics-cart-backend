import { Request, Response } from "express";
import { ShippingZone } from "../models/ShippingZone";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const listShippingZones = asyncHandler(async (_req: Request, res: Response) => {
  const zones = await ShippingZone.find().sort({ name: 1 });
  res.json({ success: true, data: zones });
});

export const createShippingZone = asyncHandler(async (req: Request, res: Response) => {
  const { name, regions, baseRate } = req.body;
  if (!name || !regions || baseRate === undefined) throw new ApiError(400, "name, regions and baseRate are required");

  const zone = await ShippingZone.create(req.body);
  res.status(201).json({ success: true, data: zone });
});

export const updateShippingZone = asyncHandler(async (req: Request, res: Response) => {
  const zone = await ShippingZone.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!zone) throw new ApiError(404, "Shipping zone not found");
  res.json({ success: true, data: zone });
});

export const deleteShippingZone = asyncHandler(async (req: Request, res: Response) => {
  const zone = await ShippingZone.findByIdAndDelete(req.params.id);
  if (!zone) throw new ApiError(404, "Shipping zone not found");
  res.json({ success: true, data: {} });
});
