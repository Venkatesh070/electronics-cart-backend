import { Request, Response } from "express";
import { Address } from "../models/Address";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

async function clearDefault(userId: string) {
  await Address.updateMany({ user: userId }, { $set: { isDefault: false } });
}

export const listAddresses = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await Address.find({ user: req.user!._id }).sort({ isDefault: -1, createdAt: -1 });
  res.json({ success: true, data: addresses });
});

export const createAddress = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!._id.toString();
  if (req.body.isDefault) await clearDefault(userId);

  const address = await Address.create({ ...req.body, user: userId });
  res.status(201).json({ success: true, data: address });
});

export const updateAddress = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!._id.toString();
  if (req.body.isDefault) await clearDefault(userId);

  const address = await Address.findOneAndUpdate(
    { _id: req.params.id, user: userId },
    req.body,
    { new: true, runValidators: true }
  );
  if (!address) throw new ApiError(404, "Address not found");
  res.json({ success: true, data: address });
});

export const deleteAddress = asyncHandler(async (req: Request, res: Response) => {
  const address = await Address.findOneAndDelete({ _id: req.params.id, user: req.user!._id });
  if (!address) throw new ApiError(404, "Address not found");
  res.json({ success: true, data: {} });
});
