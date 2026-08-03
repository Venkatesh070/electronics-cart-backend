import { Request, Response } from "express";
import { Brand } from "../models/Brand";
import { Product } from "../models/Product";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { slugify } from "../utils/slugify";

export const listBrands = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = {};
  if (req.query.featured === "true") filter.featured = true;

  const brands = await Brand.find(filter).sort({ name: 1 });
  const counts = await Product.aggregate([
    { $match: { status: { $in: ["ACTIVE", "published"] } } },
    { $group: { _id: "$brand", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

  res.json({
    success: true,
    data: brands.map((b) => ({ ...b.toObject(), productCount: countMap.get(b._id.toString()) || 0 })),
  });
});

export const getBrandBySlug = asyncHandler(async (req: Request, res: Response) => {
  const brand = await Brand.findOne({ slug: req.params.slug });
  if (!brand) throw new ApiError(404, "Brand not found");
  res.json({ success: true, data: brand });
});

export const createBrand = asyncHandler(async (req: Request, res: Response) => {
  const { name, logo, featured } = req.body;
  if (!name) throw new ApiError(400, "name is required");

  const brand = await Brand.create({ name, slug: slugify(name), logo, featured });
  res.status(201).json({ success: true, data: brand });
});

export const updateBrand = asyncHandler(async (req: Request, res: Response) => {
  const update = { ...req.body };
  if (update.name) update.slug = slugify(update.name);

  const brand = await Brand.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  });
  if (!brand) throw new ApiError(404, "Brand not found");
  res.json({ success: true, data: brand });
});

export const deleteBrand = asyncHandler(async (req: Request, res: Response) => {
  const brand = await Brand.findByIdAndDelete(req.params.id);
  if (!brand) throw new ApiError(404, "Brand not found");
  res.json({ success: true, data: {} });
});
