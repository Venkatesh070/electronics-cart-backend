import { Request, Response } from "express";
import { FlashSale } from "../models/FlashSale";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const listActiveFlashSales = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const sales = await FlashSale.find({ active: true, endsAt: { $gte: now } })
    .populate("products.product", "name images price slug")
    .sort({ startsAt: 1 });
  res.json({ success: true, data: sales });
});

export const listAllFlashSales = asyncHandler(async (_req: Request, res: Response) => {
  const sales = await FlashSale.find().populate("products.product", "name images price slug").sort({ startsAt: -1 });
  res.json({ success: true, data: sales });
});

export const createFlashSale = asyncHandler(async (req: Request, res: Response) => {
  const { name, products, startsAt, endsAt } = req.body;
  if (!name || !products || !startsAt || !endsAt) {
    throw new ApiError(400, "name, products, startsAt and endsAt are required");
  }

  const sale = await FlashSale.create(req.body);
  res.status(201).json({ success: true, data: sale });
});

export const updateFlashSale = asyncHandler(async (req: Request, res: Response) => {
  const sale = await FlashSale.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!sale) throw new ApiError(404, "Flash sale not found");
  res.json({ success: true, data: sale });
});

export const deleteFlashSale = asyncHandler(async (req: Request, res: Response) => {
  const sale = await FlashSale.findByIdAndDelete(req.params.id);
  if (!sale) throw new ApiError(404, "Flash sale not found");
  res.json({ success: true, data: {} });
});

export const flashSalePerformance = asyncHandler(async (req: Request, res: Response) => {
  const sale = await FlashSale.findById(req.params.id).populate("products.product", "name price");
  if (!sale) throw new ApiError(404, "Flash sale not found");

  const performance = sale.products.map((p) => ({
    product: p.product,
    discountPercent: p.discountPercent,
    stockCap: p.stockCap,
    soldCount: p.soldCount,
    sellThroughRate: p.stockCap > 0 ? p.soldCount / p.stockCap : 0,
  }));

  res.json({ success: true, data: performance });
});
