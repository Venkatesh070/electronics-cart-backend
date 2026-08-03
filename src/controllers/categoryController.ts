import { Request, Response } from "express";
import { Category } from "../models/Category";
import { Product } from "../models/Product";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { slugify } from "../utils/slugify";

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const categories = await Category.find().sort({ order: 1, name: 1 });
  const counts = await Product.aggregate([
    { $match: { status: { $in: ["ACTIVE", "published"] } } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

  const withCounts = categories.map((c) => ({
    ...c.toObject(),
    productCount: countMap.get(c._id.toString()) || 0,
  }));

  if (req.query.tree === "true") {
    const byId = new Map(withCounts.map((c) => [c._id.toString(), { ...c, children: [] as unknown[] }]));
    const roots: unknown[] = [];
    for (const c of byId.values()) {
      if (c.parent) {
        const parent = byId.get(c.parent.toString());
        if (parent) parent.children.push(c);
        else roots.push(c);
      } else {
        roots.push(c);
      }
    }
    return res.json({ success: true, data: roots });
  }

  res.json({ success: true, data: withCounts });
});

export const getCategoryBySlug = asyncHandler(async (req: Request, res: Response) => {
  const category = await Category.findOne({ slug: req.params.slug });
  if (!category) throw new ApiError(404, "Category not found");
  res.json({ success: true, data: category });
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const { name, image, description, parent, order } = req.body;
  if (!name) throw new ApiError(400, "name is required");

  const category = await Category.create({
    name,
    slug: slugify(name),
    image,
    description,
    parent: parent || null,
    order,
  });
  res.status(201).json({ success: true, data: category });
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const update = { ...req.body };
  if (update.name) update.slug = slugify(update.name);

  const category = await Category.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  });
  if (!category) throw new ApiError(404, "Category not found");
  res.json({ success: true, data: category });
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const hasChildren = await Category.exists({ parent: req.params.id });
  if (hasChildren) throw new ApiError(400, "Cannot delete a category that has subcategories");

  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) throw new ApiError(404, "Category not found");
  res.json({ success: true, data: {} });
});

export const reorderCategories = asyncHandler(async (req: Request, res: Response) => {
  const { order } = req.body as { order: { id: string; order: number }[] };
  if (!Array.isArray(order)) throw new ApiError(400, "order must be an array of { id, order }");

  await Promise.all(
    order.map((entry) => Category.findByIdAndUpdate(entry.id, { order: entry.order }))
  );
  res.json({ success: true, data: {} });
});
