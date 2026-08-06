import { Request, Response } from "express";
import { Types } from "mongoose";
import { Product, ProductStatus } from "../models/Product";
import { Category } from "../models/Category";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { slugify } from "../utils/slugify";
import { logAudit } from "../utils/auditLog";
import { buildVariantPayload, syncProductAggregates } from "../utils/variants";

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

function normalizeVariants(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => {
      if (!v || typeof v !== "object") return null;
      const row = v as Record<string, unknown>;
      const sku = String(row.sku || "")
        .trim()
        .toUpperCase();
      if (!sku) return null;
      const sellingPrice = Number(row.sellingPrice ?? row.price ?? 0) || 0;
      const mrp = Number(row.mrp ?? row.originalPrice ?? sellingPrice) || sellingPrice;
      let attributes: Record<string, string> = {};
      if (row.attributes && typeof row.attributes === "object") {
        attributes = Object.fromEntries(
          Object.entries(row.attributes as Record<string, string>)
            .map(([k, val]) => [String(k).trim(), String(val).trim()])
            .filter(([k, val]) => k && val)
        );
      }
      if (row.color && !attributes.Color) attributes.Color = String(row.color);
      if (row.storage && !attributes.Storage) attributes.Storage = String(row.storage);

      return {
        sku,
        barcode: row.barcode ? String(row.barcode) : undefined,
        attributes,
        mrp,
        sellingPrice,
        offerPrice: row.offerPrice != null ? Number(row.offerPrice) : undefined,
        stock: Math.max(0, Number(row.stock) || 0),
        reservedStock: Math.max(0, Number(row.reservedStock) || 0),
        minStock: Math.max(0, Number(row.minStock) || 0),
        maxOrderQty: row.maxOrderQty != null ? Number(row.maxOrderQty) : undefined,
        weight: row.weight != null ? Number(row.weight) : undefined,
        dimensions: row.dimensions,
        status: row.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
        isDefault: !!row.isDefault,
        isFeatured: !!row.isFeatured,
        isBestSeller: !!row.isBestSeller,
        images: normalizeImages(row.images),
        specifications: normalizeSpecs(row.specifications),
        tax: row.tax != null ? Number(row.tax) : undefined,
        codAvailable: row.codAvailable !== false,
        emiAvailable: row.emiAvailable !== false,
        exchangeAvailable: !!row.exchangeAvailable,
        color: attributes.Color || row.color,
        storage: attributes.Storage || row.storage,
        price: sellingPrice,
      };
    })
    .filter(Boolean);
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
    "condition",
    "warranty",
    "returnWindowDays",
    "deliveryPromise",
    "emiMonths",
    "video",
    "boxContents",
    "seo",
    "defaultVariantSku",
  ] as const;

  for (const key of copyKeys) {
    if (body[key] !== undefined) payload[key] = body[key];
  }

  if (category) payload.category = category;
  if (brand) payload.brand = brand;

  if (body.images !== undefined) payload.images = normalizeImages(body.images);
  if (body.specifications !== undefined) payload.specifications = normalizeSpecs(body.specifications);
  if (body.variants !== undefined) payload.variants = normalizeVariants(body.variants);
  if (body.optionTypes !== undefined && Array.isArray(body.optionTypes)) {
    payload.optionTypes = (body.optionTypes as { name?: string; values?: string[] }[])
      .map((o) => ({
        name: String(o.name || "").trim(),
        values: Array.isArray(o.values) ? o.values.map(String).filter(Boolean) : [],
      }))
      .filter((o) => o.name);
  }

  if (body.status !== undefined) {
    const status = normalizeStatus(String(body.status));
    if (!status) throw new ApiError(400, `status must be one of: ${VALID_STATUSES.join(", ")}`);
    payload.status = status;
  }

  if (body.slug) payload.slug = slugify(String(body.slug));
  else if (name) payload.slug = slugify(String(name));

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

  if (body.lowStockThreshold !== undefined && body.minStock === undefined) {
    payload.minStock = body.lowStockThreshold;
  }

  if (payload.sku) payload.sku = String(payload.sku).trim().toUpperCase();
  if (payload.defaultVariantSku) {
    payload.defaultVariantSku = String(payload.defaultVariantSku).trim().toUpperCase();
  }

  return payload;
}

function productResponse(product: InstanceType<typeof Product>) {
  const base = product.toObject({ virtuals: true });
  return { ...base, ...buildVariantPayload(product) };
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
    data: products.map((p) => productResponse(p)),
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

/** Product links may use either the Mongo id or the slug (e.g. /product/acer-aspire-15). */
function findProductByIdOrSlug(idOrSlug: string) {
  const query = Types.ObjectId.isValid(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  return Product.findOne(query).populate("category", "name slug").populate("brand", "name slug logo");
}

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await findProductByIdOrSlug(req.params.id);
  if (!product) throw new ApiError(404, "Product not found");
  res.json({ success: true, data: productResponse(product) });
});

export const getProductBySlug = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findOne({ slug: req.params.slug })
    .populate("category", "name slug")
    .populate("brand", "name slug logo");
  if (!product) throw new ApiError(404, "Product not found");
  res.json({ success: true, data: productResponse(product) });
});

export const getRelatedProducts = asyncHandler(async (req: Request, res: Response) => {
  const product = await findProductByIdOrSlug(req.params.id);
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

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const payload = buildProductPayload(req.body, { requireCore: true });
  const product = await Product.create(payload);
  syncProductAggregates(product);
  await product.save();
  await logAudit(req, "products", "create", product._id.toString());
  const populated = await Product.findById(product._id)
    .populate("category", "name slug")
    .populate("brand", "name slug logo");
  res.status(201).json({ success: true, data: populated ? productResponse(populated) : product });
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const payload = buildProductPayload(req.body);
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, "Product not found");
  Object.assign(product, payload);
  if (payload.variants !== undefined) syncProductAggregates(product);
  await product.save();
  await product.populate("category", "name slug");
  await product.populate("brand", "name slug logo");
  await logAudit(req, "products", "update", product._id.toString());
  res.json({ success: true, data: productResponse(product) });
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
