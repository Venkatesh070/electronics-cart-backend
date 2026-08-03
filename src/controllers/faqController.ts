import { Request, Response } from "express";
import { Faq } from "../models/Faq";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const listFaqs = asyncHandler(async (req: Request, res: Response) => {
  const { category } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (category) filter.category = category;

  const faqs = await Faq.find(filter).sort({ category: 1, order: 1 });
  res.json({ success: true, data: faqs });
});

export const createFaq = asyncHandler(async (req: Request, res: Response) => {
  const { category, question, answer, order } = req.body;
  if (!category || !question || !answer) throw new ApiError(400, "category, question and answer are required");

  const faq = await Faq.create({ category, question, answer, order });
  res.status(201).json({ success: true, data: faq });
});

export const updateFaq = asyncHandler(async (req: Request, res: Response) => {
  const faq = await Faq.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!faq) throw new ApiError(404, "FAQ not found");
  res.json({ success: true, data: faq });
});

export const deleteFaq = asyncHandler(async (req: Request, res: Response) => {
  const faq = await Faq.findByIdAndDelete(req.params.id);
  if (!faq) throw new ApiError(404, "FAQ not found");
  res.json({ success: true, data: {} });
});
