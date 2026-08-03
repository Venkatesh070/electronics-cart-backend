import { Request, Response } from "express";
import { GiftCardDenomination } from "../models/GiftCardDenomination";
import { GiftCard, generateGiftCardCode } from "../models/GiftCard";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { logAudit } from "../utils/auditLog";

// --- Catalog (admin) ---

export const listDenominations = asyncHandler(async (req: Request, res: Response) => {
  const denominations = await GiftCardDenomination.find().sort({ amount: 1 });
  res.json({ success: true, data: denominations });
});

export const createDenomination = asyncHandler(async (req: Request, res: Response) => {
  const { amount, image } = req.body;
  if (!amount) throw new ApiError(400, "amount is required");
  const denomination = await GiftCardDenomination.create({ amount, image });
  res.status(201).json({ success: true, data: denomination });
});

export const deleteDenomination = asyncHandler(async (req: Request, res: Response) => {
  const denomination = await GiftCardDenomination.findByIdAndDelete(req.params.id);
  if (!denomination) throw new ApiError(404, "Denomination not found");
  res.json({ success: true, data: {} });
});

// --- Issued cards (admin) ---

export const listIssuedGiftCards = asyncHandler(async (req: Request, res: Response) => {
  const cards = await GiftCard.find().populate("issuedTo", "name email").sort({ createdAt: -1 });
  res.json({ success: true, data: cards });
});

export const issueGiftCard = asyncHandler(async (req: Request, res: Response) => {
  const { amount, issuedToEmail, expiresAt } = req.body;
  if (!amount) throw new ApiError(400, "amount is required");

  const card = await GiftCard.create({
    code: generateGiftCardCode(),
    initialBalance: amount,
    balance: amount,
    issuedToEmail,
    expiresAt,
  });
  await logAudit(req, "gift-cards", "issue", card._id.toString());
  res.status(201).json({ success: true, data: card });
});

export const voidGiftCard = asyncHandler(async (req: Request, res: Response) => {
  const card = await GiftCard.findByIdAndUpdate(req.params.id, { status: "void" }, { new: true });
  if (!card) throw new ApiError(404, "Gift card not found");
  await logAudit(req, "gift-cards", "void", card._id.toString());
  res.json({ success: true, data: card });
});

export const lookupBalance = asyncHandler(async (req: Request, res: Response) => {
  const card = await GiftCard.findOne({ code: (req.params.code || "").toUpperCase() });
  if (!card) throw new ApiError(404, "Gift card not found");
  res.json({ success: true, data: { code: card.code, balance: card.balance, status: card.status } });
});

// --- Customer redemption ---

export const redeemGiftCard = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) throw new ApiError(400, "code is required");

  const card = await GiftCard.findOne({ code: code.toUpperCase() });
  if (!card) throw new ApiError(404, "Invalid gift card code");
  if (card.status !== "active") throw new ApiError(400, `This gift card is ${card.status}`);
  if (card.expiresAt && card.expiresAt < new Date()) {
    card.status = "expired";
    await card.save();
    throw new ApiError(400, "This gift card has expired");
  }
  if (card.balance <= 0) throw new ApiError(400, "This gift card has no remaining balance");

  res.json({ success: true, data: { code: card.code, balance: card.balance } });
});
