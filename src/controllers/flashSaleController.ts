import { Request, Response } from "express";
import { Types } from "mongoose";
import { FlashSale } from "../models/FlashSale";
import { Product } from "../models/Product";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

const PRODUCT_SELECT =
  "name images price originalPrice discount slug stock brand category shortDescription status";

function normalizeStatus(value?: string, active?: boolean): "ACTIVE" | "DRAFT" | "INACTIVE" {
  if (value) {
    const v = String(value).toUpperCase();
    if (v === "ACTIVE" || v === "DRAFT" || v === "INACTIVE") return v;
  }
  return active === false ? "INACTIVE" : "ACTIVE";
}

function buildPayload(body: Record<string, unknown>, { requireCore = false } = {}) {
  const name = body.name as string | undefined;
  const startsAt = body.startsAt as string | undefined;
  const endsAt = body.endsAt as string | undefined;

  if (requireCore) {
    if (!name || !startsAt || !endsAt) {
      throw new ApiError(400, "name, startsAt and endsAt are required");
    }
  }

  const payload: Record<string, unknown> = {};
  const keys = [
    "name",
    "shortDescription",
    "saleType",
    "products",
    "categories",
    "startsAt",
    "endsAt",
    "timezone",
    "discountType",
    "discountValue",
    "maxDiscount",
    "minPurchase",
    "applicableOn",
    "bannerBackground",
  ] as const;

  for (const key of keys) {
    if (body[key] !== undefined) payload[key] = body[key];
  }

  if (body.status !== undefined || body.active !== undefined) {
    const status = normalizeStatus(body.status as string | undefined, body.active as boolean | undefined);
    payload.status = status;
    payload.active = status === "ACTIVE";
  }

  if (payload.discountValue !== undefined) payload.discountValue = Number(payload.discountValue) || 0;
  if (payload.maxDiscount === "" || payload.maxDiscount == null) delete payload.maxDiscount;
  else if (payload.maxDiscount !== undefined) payload.maxDiscount = Number(payload.maxDiscount) || 0;
  if (payload.minPurchase === "" || payload.minPurchase == null) delete payload.minPurchase;
  else if (payload.minPurchase !== undefined) payload.minPurchase = Number(payload.minPurchase) || 0;

  return payload;
}

function categoryIdOf(row: { category?: Types.ObjectId | { _id?: Types.ObjectId } | string }) {
  const c = row.category;
  if (!c) return "";
  if (typeof c === "string") return c;
  if (typeof c === "object" && "_id" in c) return String(c._id);
  return String(c);
}

function discountForCategory(
  categories: { category?: unknown; discountPercent?: number }[],
  productCategoryId: string,
  fallback: number
) {
  const match = categories.find((row) => categoryIdOf(row as { category?: Types.ObjectId }) === productCategoryId);
  return Number(match?.discountPercent) || fallback;
}

/** Ensure storefront always gets product lines for banners/deals. */
async function hydrateFlashSaleProducts(saleDoc: InstanceType<typeof FlashSale>) {
  const sale = saleDoc.toObject({ virtuals: true }) as unknown as Record<string, unknown> & {
    products?: Array<Record<string, unknown>>;
    categories?: Array<Record<string, unknown>>;
    discountValue?: number;
    applicableOn?: string;
    saleType?: string;
  };

  const discountValue = Number(sale.discountValue) || 0;
  const existing = Array.isArray(sale.products) ? sale.products : [];
  const resolved = existing.filter((row) => {
    const p = row.product;
    return p && typeof p === "object" && ("name" in (p as object) || "_id" in (p as object));
  });

  if (resolved.length) {
    return {
      ...sale,
      products: resolved.map((row) => ({
        ...row,
        discountPercent: Number(row.discountPercent) || discountValue,
      })),
    };
  }

  const categories = Array.isArray(sale.categories) ? sale.categories : [];
  const categoryIds = categories
    .map((row) => categoryIdOf(row as { category?: Types.ObjectId }))
    .filter(Boolean)
    .map((id) => new Types.ObjectId(id));

  const wantsAll =
    sale.applicableOn === "all" ||
    sale.saleType === "sitewide" ||
    (!existing.length && !categoryIds.length);

  let products: InstanceType<typeof Product>[] = [];
  if (wantsAll) {
    products = await Product.find({ status: { $in: ["ACTIVE", "published"] } })
      .select(PRODUCT_SELECT)
      .sort({ featured: -1, createdAt: -1 })
      .limit(24);
  } else if (categoryIds.length) {
    products = await Product.find({
      status: { $in: ["ACTIVE", "published"] },
      category: { $in: categoryIds },
    })
      .select(PRODUCT_SELECT)
      .sort({ featured: -1, createdAt: -1 })
      .limit(24);
  }

  return {
    ...sale,
    products: products.map((p) => {
      const catId = String(p.category || "");
      return {
        product: p,
        discountPercent: categoryIds.length
          ? discountForCategory(categories as { category?: unknown; discountPercent?: number }[], catId, discountValue)
          : discountValue || Number(p.discount) || 0,
        stockCap: Number(p.stock) || 0,
        soldCount: 0,
      };
    }),
  };
}

export const listActiveFlashSales = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const sales = await FlashSale.find({
    startsAt: { $lte: now },
    endsAt: { $gte: now },
    active: { $ne: false },
    status: { $nin: ["DRAFT", "INACTIVE"] },
  })
    .populate("products.product", PRODUCT_SELECT)
    .populate("categories.category", "name image slug")
    .sort({ endsAt: 1 });

  const data = await Promise.all(sales.map((sale) => hydrateFlashSaleProducts(sale)));
  res.json({ success: true, data });
});

export const listAllFlashSales = asyncHandler(async (_req: Request, res: Response) => {
  const sales = await FlashSale.find()
    .populate("products.product", "name images price slug")
    .populate("categories.category", "name image slug")
    .sort({ startsAt: -1 });
  res.json({ success: true, data: sales });
});

export const getFlashSaleById = asyncHandler(async (req: Request, res: Response) => {
  const sale = await FlashSale.findById(req.params.id)
    .populate("products.product", "name images price slug stock category")
    .populate("categories.category", "name image slug");
  if (!sale) throw new ApiError(404, "Flash sale not found");
  res.json({ success: true, data: sale });
});

export const createFlashSale = asyncHandler(async (req: Request, res: Response) => {
  const payload = buildPayload(req.body, { requireCore: true });
  if (!payload.status) {
    payload.status = "ACTIVE";
    payload.active = true;
  }
  const sale = await FlashSale.create(payload);
  const populated = await FlashSale.findById(sale._id)
    .populate("products.product", "name images price slug")
    .populate("categories.category", "name image slug");
  res.status(201).json({ success: true, data: populated || sale });
});

export const updateFlashSale = asyncHandler(async (req: Request, res: Response) => {
  const payload = buildPayload(req.body);
  const sale = await FlashSale.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true,
  })
    .populate("products.product", "name images price slug")
    .populate("categories.category", "name image slug");
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
