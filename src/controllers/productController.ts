import { Request, Response } from "express";
import { Product, ProductStatus } from "../models/Product";
import { Category } from "../models/Category";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { slugify } from "../utils/slugify";
import { logAudit } from "../utils/auditLog";

const SORTS: Record<string, Record<string, 1 | -1>> = {
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  popularity: { ratingsCount: -1 },
  newest: { createdAt: -1 },
  rating: { ratingsAverage: -1 },
};

const ACTIVE_STATUSES: Array<ProductStatus | "published"> = ["ACTIVE", "published"];
const VALID_STATUSES: ProductStatus[] = ["ACTIVE", "DRAFT", "INACTIVE"];

/** Map legacy status strings to current enum. */
function normalizeStatus(value?: string): ProductStatus | undefined {
  if (!value) return undefined;
  const v = value.toUpperCase();
  if (v === "PUBLISHED" || v === "ACTIVE") return "ACTIVE";
  if (v === "DRAFT") return "DRAFT";
  if (v === "ARCHIVED" || v === "INACTIVE") return "INACTIVE";
  if (VALID_STATUSES.includes(value as ProductStatus)) return value as ProductStatus;
  return undefined;
}

function normalizeImages(images: unknown): { url: string; isPrimary: boolean }[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((img, index) => {
      if (typeof img === "string") return { url: img, isPrimary: index === 0 };
      if (img && typeof img === "object" && "url" in img) {
        return {
          url: String((img as { url: string }).url),
          isPrimary: Boolean((img as { isPrimary?: boolean }).isPrimary) || index === 0,
        };
      }
      return null;
    })
    .filter(Boolean) as { url: string; isPrimary: boolean }[];
}

function normalizeSpecs(specs: unknown): { key: string; value: string }[] {
  if (!specs) return [];
  if (Array.isArray(specs)) {
    return specs
      .map((s) => {
        if (!s || typeof s !== "object") return null;
        const key = String((s as { key?: string }).key || "").trim();
        const value = String((s as { value?: string }).value || "").trim();
        if (!key || !value) return null;
        return { key, value };
      })
      .filter(Boolean) as { key: string; value: string }[];
  }
  if (typeof specs === "object") {
    return Object.entries(specs as Record<string, string>).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  }
  return [];
}

function buildProductPayload(body: Record<string, unknown>, { requireCore = false } = {}) {
  const category = (body.categoryId || body.category) as string | undefined;
  const brand = (body.brandId || body.brand) as string | undefined;
  const name = body.name as string | undefined;
  const description = body.description as string | undefined;
  const price = body.price;

  if (requireCore) {
    if (!name || !description || price === undefined || !category || !brand) {
      throw new ApiError(400, "name, description, price, categoryId and brandId are required");
    }
    if (!body.sku) throw new ApiError(400, "sku is required");
  }

  const payload: Record<string, unknown> = {};

  const copyKeys = [
    "sku",
    "name",
    "shortDescription",
    "description",
    "price",
    "originalPrice",
    "discount",
    "tax",
    "stock",
    "minStock",
    "featured",
    "bestSeller",
    "newArrival",
    "warranty",
    "video",
    "variants",
    "boxContents",
    "seo",
  ] as const;

  for (const key of copyKeys) {
    if (body[key] !== undefined) payload[key] = body[key];
  }

  if (category) payload.category = category;
  if (brand) payload.brand = brand;

  if (body.images !== undefined) payload.images = normalizeImages(body.images);
  if (body.specifications !== undefined) payload.specifications = normalizeSpecs(body.specifications);

  if (body.status !== undefined) {
    const status = normalizeStatus(String(body.status));
    if (!status) throw new ApiError(400, `status must be one of: ${VALID_STATUSES.join(", ")}`);
    payload.status = status;
  }

  if (body.slug) payload.slug = slugify(String(body.slug));
  else if (name) payload.slug = slugify(String(name));

  // Auto-calc discount from originalPrice when not provided
  if (
    payload.originalPrice !== undefined &&
    payload.price !== undefined &&
    body.discount === undefined
  ) {
    const original = Number(payload.originalPrice);
    const current = Number(payload.price);
    if (original > 0 && original >= current) {
      payload.discount = Math.round(((original - current) / original) * 100);
    }
  }

  // Alias legacy field
  if (body.lowStockThreshold !== undefined && body.minStock === undefined) {
    payload.minStock = body.lowStockThreshold;
  }

  if (payload.sku) payload.sku = String(payload.sku).trim().toUpperCase();

  return payload;
}

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const {
    category,
    brand,
    search,
    minPrice,
    maxPrice,
    minRating,
    inStock,
    status,
    featured,
    bestSeller,
    newArrival,
    sort = "newest",
    page = "1",
    limit = "20",
  } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = {};

  if (category) {
    const cat = await Category.findOne({ slug: category });
    filter.category = cat ? cat._id : category;
  }
  if (brand) filter.brand = brand;
  if (search) filter.$text = { $search: search };

  if (status && status !== "all") {
    const normalized = normalizeStatus(status);
    if (normalized) filter.status = normalized;
  } else if (!status) {
    filter.status = { $in: ACTIVE_STATUSES };
  }

  if (featured === "true") filter.featured = true;
  if (bestSeller === "true") filter.bestSeller = true;
  if (newArrival === "true") filter.newArrival = true;

  if (minPrice || maxPrice) {
    filter.price = {} as Record<string, number>;
    if (minPrice) (filter.price as Record<string, number>).$gte = Number(minPrice);
    if (maxPrice) (filter.price as Record<string, number>).$lte = Number(maxPrice);
  }
  if (minRating) filter.ratingsAverage = { $gte: Number(minRating) };
  if (inStock === "true") filter.stock = { $gt: 0 };

  for (const [key, value] of Object.entries(req.query)) {
    if (key.startsWith("spec.")) {
      filter.specifications = {
        $elemMatch: { key: key.slice(5), value },
      };
    }
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const sortSpec = SORTS[sort] || SORTS.newest;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name slug")
      .populate("brand", "name slug logo")
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort(sortSpec),
    Product.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: products,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findById(req.params.id)
    .populate("category", "name slug")
    .populate("brand", "name slug logo");
  if (!product) throw new ApiError(404, "Product not found");
  res.json({ success: true, data: product });
});

export const getProductBySlug = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findOne({ slug: req.params.slug })
    .populate("category", "name slug")
    .populate("brand", "name slug logo");
  if (!product) throw new ApiError(404, "Product not found");
  res.json({ success: true, data: product });
});

export const getRelatedProducts = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, "Product not found");

  const related = await Product.find({
    category: product.category,
    _id: { $ne: product._id },
    status: { $in: ["ACTIVE", "published"] },
  })
    .limit(8)
    .sort({ ratingsAverage: -1 });

  res.json({ success: true, data: related });
});

export const compareProducts = asyncHandler(async (req: Request, res: Response) => {
  const ids = ((req.query.ids as string) || "").split(",").filter(Boolean);
  if (ids.length === 0) throw new ApiError(400, "ids query param is required");
  if (ids.length > 4) throw new ApiError(400, "You can compare at most 4 products");

  const products = await Product.find({ _id: { $in: ids } })
    .populate("category", "name slug")
    .populate("brand", "name slug logo");

  res.json({ success: true, data: products });
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const payload = buildProductPayload(req.body, { requireCore: true });
  const product = await Product.create(payload);
  await logAudit(req, "products", "create", product._id.toString());
  const populated = await Product.findById(product._id)
    .populate("category", "name slug")
    .populate("brand", "name slug logo");
  res.status(201).json({ success: true, data: populated });
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const payload = buildProductPayload(req.body);
  const product = await Product.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true,
  })
    .populate("category", "name slug")
    .populate("brand", "name slug logo");
  if (!product) throw new ApiError(404, "Product not found");
  await logAudit(req, "products", "update", product._id.toString());
  res.json({ success: true, data: product });
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw new ApiError(404, "Product not found");
  await logAudit(req, "products", "delete", product._id.toString());
  res.json({ success: true, data: {} });
});

export const bulkUpdateStatus = asyncHandler(async (req: Request, res: Response) => {
  const { ids, status } = req.body as { ids: string[]; status: string };
  const normalized = normalizeStatus(status);
  if (!Array.isArray(ids) || ids.length === 0) throw new ApiError(400, "ids must be a non-empty array");
  if (!normalized) throw new ApiError(400, `status must be one of: ${VALID_STATUSES.join(", ")}`);

  await Product.updateMany({ _id: { $in: ids } }, { $set: { status: normalized } });
  await logAudit(req, "products", "bulk-status-update", ids.join(","));
  res.json({ success: true, data: {} });
});

export const bulkDelete = asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) throw new ApiError(400, "ids must be a non-empty array");

  await Product.deleteMany({ _id: { $in: ids } });
  await logAudit(req, "products", "bulk-delete", ids.join(","));
  res.json({ success: true, data: {} });
});

export const listLowStock = asyncHandler(async (_req: Request, res: Response) => {
  const products = await Product.find({
    $expr: { $lte: ["$stock", "$minStock"] },
    status: { $ne: "INACTIVE" },
  }).sort({ stock: 1 });
  res.json({ success: true, data: products });
});
