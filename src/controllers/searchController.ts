import { Request, Response } from "express";
import { Product } from "../models/Product";
import { Brand } from "../models/Brand";
import { Category } from "../models/Category";
import { SearchLog } from "../models/SearchLog";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const autocomplete = asyncHandler(async (req: Request, res: Response) => {
  const q = (req.query.q as string) || "";
  if (!q.trim()) return res.json({ success: true, data: { products: [], brands: [], categories: [] } });

  const regex = new RegExp(q, "i");
  const [products, brands, categories] = await Promise.all([
    Product.find({ name: regex, status: { $in: ["ACTIVE", "published"] } }).limit(5).select("name slug images price sku"),
    Brand.find({ name: regex }).limit(5).select("name slug logo"),
    Category.find({ name: regex }).limit(5).select("name slug image"),
  ]);

  res.json({ success: true, data: { products, brands, categories } });
});

export const logSearch = asyncHandler(async (req: Request, res: Response) => {
  const { query, resultsCount = 0 } = req.body;
  if (!query || !query.trim()) throw new ApiError(400, "query is required");

  await SearchLog.create({ user: req.user?._id, query: query.trim(), resultsCount });
  res.status(201).json({ success: true, data: {} });
});

export const trendingSearches = asyncHandler(async (req: Request, res: Response) => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const trending = await SearchLog.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: "$query", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);
  res.json({ success: true, data: trending.map((t) => ({ query: t._id, count: t.count })) });
});

export const recentSearches = asyncHandler(async (req: Request, res: Response) => {
  const logs = await SearchLog.find({ user: req.user!._id }).sort({ createdAt: -1 }).limit(20);
  const seen = new Set<string>();
  const recent: string[] = [];
  for (const log of logs) {
    if (!seen.has(log.query)) {
      seen.add(log.query);
      recent.push(log.query);
    }
    if (recent.length >= 10) break;
  }
  res.json({ success: true, data: recent });
});
