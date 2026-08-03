import { Request, Response } from "express";
import { Banner } from "../models/Banner";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const listActiveBanners = asyncHandler(async (req: Request, res: Response) => {
  const { placement = "home" } = req.query as Record<string, string>;
  const now = new Date();

  const banners = await Banner.find({
    placement,
    active: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).sort({ priority: -1 });

  res.json({ success: true, data: banners });
});

export const listAllBanners = asyncHandler(async (_req: Request, res: Response) => {
  const banners = await Banner.find().sort({ priority: -1 });
  res.json({ success: true, data: banners });
});

export const createBanner = asyncHandler(async (req: Request, res: Response) => {
  const { title, image, startDate, endDate } = req.body;
  if (!title || !image || !startDate || !endDate) {
    throw new ApiError(400, "title, image, startDate and endDate are required");
  }

  const banner = await Banner.create(req.body);
  res.status(201).json({ success: true, data: banner });
});

export const updateBanner = asyncHandler(async (req: Request, res: Response) => {
  const banner = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!banner) throw new ApiError(404, "Banner not found");
  res.json({ success: true, data: banner });
});

export const deleteBanner = asyncHandler(async (req: Request, res: Response) => {
  const banner = await Banner.findByIdAndDelete(req.params.id);
  if (!banner) throw new ApiError(404, "Banner not found");
  res.json({ success: true, data: {} });
});
