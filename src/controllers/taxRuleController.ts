import { Request, Response } from "express";
import { TaxRule } from "../models/TaxRule";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const listTaxRules = asyncHandler(async (_req: Request, res: Response) => {
  const rules = await TaxRule.find().populate("category", "name").sort({ region: 1 });
  res.json({ success: true, data: rules });
});

export const createTaxRule = asyncHandler(async (req: Request, res: Response) => {
  const { region, ratePercent } = req.body;
  if (!region || ratePercent === undefined) throw new ApiError(400, "region and ratePercent are required");

  const rule = await TaxRule.create(req.body);
  res.status(201).json({ success: true, data: rule });
});

export const updateTaxRule = asyncHandler(async (req: Request, res: Response) => {
  const rule = await TaxRule.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!rule) throw new ApiError(404, "Tax rule not found");
  res.json({ success: true, data: rule });
});

export const deleteTaxRule = asyncHandler(async (req: Request, res: Response) => {
  const rule = await TaxRule.findByIdAndDelete(req.params.id);
  if (!rule) throw new ApiError(404, "Tax rule not found");
  res.json({ success: true, data: {} });
});
