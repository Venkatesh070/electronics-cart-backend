import { Request, Response } from "express";
import { HomepageBlock } from "../models/HomepageBlock";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const listActiveBlocks = asyncHandler(async (_req: Request, res: Response) => {
  const blocks = await HomepageBlock.find({ active: true }).sort({ order: 1 });
  res.json({ success: true, data: blocks });
});

export const listAllBlocks = asyncHandler(async (_req: Request, res: Response) => {
  const blocks = await HomepageBlock.find().sort({ order: 1 });
  res.json({ success: true, data: blocks });
});

export const createBlock = asyncHandler(async (req: Request, res: Response) => {
  const { type, config, order } = req.body;
  if (!type) throw new ApiError(400, "type is required");

  const block = await HomepageBlock.create({ type, config, order });
  res.status(201).json({ success: true, data: block });
});

export const updateBlock = asyncHandler(async (req: Request, res: Response) => {
  const block = await HomepageBlock.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!block) throw new ApiError(404, "Homepage block not found");
  res.json({ success: true, data: block });
});

export const deleteBlock = asyncHandler(async (req: Request, res: Response) => {
  const block = await HomepageBlock.findByIdAndDelete(req.params.id);
  if (!block) throw new ApiError(404, "Homepage block not found");
  res.json({ success: true, data: {} });
});
