import { Request, Response } from "express";
import { BlogPost } from "../models/BlogPost";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { slugify } from "../utils/slugify";

export const listPosts = asyncHandler(async (req: Request, res: Response) => {
  const { category, q, page = "1", limit = "10" } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { status: "published" };
  if (category) filter.category = category;
  if (q?.trim()) {
    filter.$or = [
      { title: { $regex: q.trim(), $options: "i" } },
      { category: { $regex: q.trim(), $options: "i" } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

  const [raw, total, categoryAgg] = await Promise.all([
    BlogPost.find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .select("title slug category coverImage publishedAt createdAt content")
      .lean(),
    BlogPost.countDocuments(filter),
    BlogPost.aggregate([
      { $match: { status: "published" } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]),
  ]);

  const posts = raw.map((post) => {
    const plain = String(post.content || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const { content: _c, ...rest } = post;
    return { ...rest, excerpt: plain.slice(0, 160) };
  });

  const categories = categoryAgg
    .map((row) => ({ name: row._id as string, count: row.count as number }))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({
    success: true,
    data: posts,
    categories,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) || 1 },
  });
});

export const getPostBySlug = asyncHandler(async (req: Request, res: Response) => {
  const post = await BlogPost.findOne({ slug: req.params.slug, status: "published" }).populate("author", "name");
  if (!post) throw new ApiError(404, "Post not found");

  const related = await BlogPost.find({
    category: post.category,
    _id: { $ne: post._id },
    status: "published",
  })
    .limit(4)
    .select("title slug coverImage publishedAt");

  res.json({ success: true, data: { post, related } });
});

export const adminListPosts = asyncHandler(async (_req: Request, res: Response) => {
  const posts = await BlogPost.find().sort({ createdAt: -1 });
  res.json({ success: true, data: posts });
});

export const createPost = asyncHandler(async (req: Request, res: Response) => {
  const { title, category, content, coverImage, status } = req.body;
  if (!title || !category || !content) throw new ApiError(400, "title, category and content are required");

  const post = await BlogPost.create({
    title,
    slug: slugify(title),
    category,
    content,
    coverImage,
    status,
    author: req.user!._id,
    publishedAt: status === "published" ? new Date() : undefined,
  });
  res.status(201).json({ success: true, data: post });
});

export const updatePost = asyncHandler(async (req: Request, res: Response) => {
  const update = { ...req.body };
  if (update.title) update.slug = slugify(update.title);
  if (update.status === "published") update.publishedAt = new Date();

  const post = await BlogPost.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!post) throw new ApiError(404, "Post not found");
  res.json({ success: true, data: post });
});

export const deletePost = asyncHandler(async (req: Request, res: Response) => {
  const post = await BlogPost.findByIdAndDelete(req.params.id);
  if (!post) throw new ApiError(404, "Post not found");
  res.json({ success: true, data: {} });
});
