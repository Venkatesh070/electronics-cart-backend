import { Request, Response } from "express";
import { Brand } from "../models/Brand";
import { Product } from "../models/Product";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { slugify } from "../utils/slugify";

function buildBrandPayload(body: Record<string, unknown>, { requireName = false } = {}) {
  const name = body.name as string | undefined;
  if (requireName && !name) throw new ApiError(400, "name is required");

  const payload: Record<string, unknown> = {};

  if (name !== undefined) payload.name = String(name).trim();
  if (body.slug !== undefined && String(body.slug).trim()) {
    payload.slug = slugify(String(body.slug));
  } else if (name) {
    payload.slug = slugify(String(name));
  }

  const copyKeys = [
    "logo",
    "banner",
    "icon",
    "shortDescription",
    "description",
    "website",
    "supportEmail",
    "supportPhone",
    "countryOfOrigin",
    "status",
    "visibility",
    "featured",
  ] as const;

  for (const key of copyKeys) {
    if (body[key] !== undefined) payload[key] = body[key];
  }

  if (body.establishedYear !== undefined && body.establishedYear !== "" && body.establishedYear != null) {
    payload.establishedYear = Number(body.establishedYear) || undefined;
  }

  if (payload.status) {
    const status = String(payload.status).toUpperCase();
    if (!["ACTIVE", "INACTIVE", "DRAFT"].includes(status)) {
      throw new ApiError(400, "status must be ACTIVE, INACTIVE or DRAFT");
    }
    payload.status = status;
  }

  if (payload.visibility != null) {
    const visibility = String(payload.visibility).toLowerCase();
    if (!["public", "private"].includes(visibility)) {
      throw new ApiError(400, "visibility must be public or private");
    }
    payload.visibility = visibility;
  }

  return payload;
}

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

export const getBrandById = asyncHandler(async (req: Request, res: Response) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) throw new ApiError(404, "Brand not found");
  res.json({ success: true, data: brand });
});

export const createBrand = asyncHandler(async (req: Request, res: Response) => {
  const payload = buildBrandPayload(req.body, { requireName: true });
  const brand = await Brand.create(payload);
  res.status(201).json({ success: true, data: brand });
});

export const updateBrand = asyncHandler(async (req: Request, res: Response) => {
  const payload = buildBrandPayload(req.body);
  const brand = await Brand.findByIdAndUpdate(req.params.id, payload, {
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
