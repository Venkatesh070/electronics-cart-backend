import { Request, Response } from "express";
import { PaymentMethod } from "../models/PaymentMethod";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

async function clearDefault(userId: string) {
  await PaymentMethod.updateMany({ user: userId }, { $set: { isDefault: false } });
}

export const listPaymentMethods = asyncHandler(async (req: Request, res: Response) => {
  const methods = await PaymentMethod.find({ user: req.user!._id }).sort({ isDefault: -1, createdAt: -1 });
  res.json({ success: true, data: methods });
});

export const addPaymentMethod = asyncHandler(async (req: Request, res: Response) => {
  const { type, token } = req.body;
  if (!type || !token) {
    throw new ApiError(400, "type and token are required (token comes from your payment gateway's client SDK)");
  }

  const userId = req.user!._id.toString();
  if (req.body.isDefault) await clearDefault(userId);

  const method = await PaymentMethod.create({ ...req.body, user: userId });
  res.status(201).json({ success: true, data: method });
});

export const setDefaultPaymentMethod = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!._id.toString();
  await clearDefault(userId);

  const method = await PaymentMethod.findOneAndUpdate(
    { _id: req.params.id, user: userId },
    { isDefault: true },
    { new: true }
  );
  if (!method) throw new ApiError(404, "Payment method not found");
  res.json({ success: true, data: method });
});

export const removePaymentMethod = asyncHandler(async (req: Request, res: Response) => {
  const method = await PaymentMethod.findOneAndDelete({ _id: req.params.id, user: req.user!._id });
  if (!method) throw new ApiError(404, "Payment method not found");
  res.json({ success: true, data: {} });
});
