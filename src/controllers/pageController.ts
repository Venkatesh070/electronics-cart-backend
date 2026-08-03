import { Request, Response } from "express";
import { Page } from "../models/Page";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { slugify } from "../utils/slugify";

export const getPageBySlug = asyncHandler(async (req: Request, res: Response) => {
  const page = await Page.findOne({ slug: req.params.slug, status: "published" });
  if (!page) throw new ApiError(404, "Page not found");
  res.json({ success: true, data: page });
});

export const listPages = asyncHandler(async (_req: Request, res: Response) => {
  const pages = await Page.find().sort({ title: 1 });
  res.json({ success: true, data: pages });
});

export const createPage = asyncHandler(async (req: Request, res: Response) => {
  const { title, content, status } = req.body;
  if (!title || !content) throw new ApiError(400, "title and content are required");

  const page = await Page.create({ title, content, status, slug: slugify(title) });
  res.status(201).json({ success: true, data: page });
});

export const updatePage = asyncHandler(async (req: Request, res: Response) => {
  const update = { ...req.body };
  if (update.title) update.slug = slugify(update.title);

  const page = await Page.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!page) throw new ApiError(404, "Page not found");
  res.json({ success: true, data: page });
});

export const deletePage = asyncHandler(async (req: Request, res: Response) => {
  const page = await Page.findByIdAndDelete(req.params.id);
  if (!page) throw new ApiError(404, "Page not found");
  res.json({ success: true, data: {} });
});
