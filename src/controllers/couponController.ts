import { Request, Response } from "express";
import { Coupon } from "../models/Coupon";
import { Cart } from "../models/Cart";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { computeCouponDiscount } from "../utils/couponPricing";
import { logAudit } from "../utils/auditLog";

export const listCoupons = asyncHandler(async (req: Request, res: Response) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 });
  const now = new Date();

  res.json({
    success: true,
    data: coupons.map((c) => ({
      ...c.toObject(),
      usageCount: c.redemptions.length,
      status: !c.active ? "inactive" : now > c.validTo ? "expired" : now < c.validFrom ? "scheduled" : "active",
    })),
  });
});

export const createCoupon = asyncHandler(async (req: Request, res: Response) => {
  const { code, type, value, validFrom, validTo } = req.body;
  if (!code || !type || value === undefined || !validFrom || !validTo) {
    throw new ApiError(400, "code, type, value, validFrom and validTo are required");
  }

  const coupon = await Coupon.create({ ...req.body, code: code.toUpperCase() });
  await logAudit(req, "coupons", "create", coupon._id.toString());
  res.status(201).json({ success: true, data: coupon });
});

export const updateCoupon = asyncHandler(async (req: Request, res: Response) => {
  const update = { ...req.body };
  if (update.code) update.code = update.code.toUpperCase();

  const coupon = await Coupon.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!coupon) throw new ApiError(404, "Coupon not found");
  await logAudit(req, "coupons", "update", coupon._id.toString());
  res.json({ success: true, data: coupon });
});

export const deleteCoupon = asyncHandler(async (req: Request, res: Response) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) throw new ApiError(404, "Coupon not found");
  await logAudit(req, "coupons", "delete", coupon._id.toString());
  res.json({ success: true, data: {} });
});

export const validateCoupon = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) throw new ApiError(400, "code is required");

  const coupon = await Coupon.findOne({ code: code.toUpperCase() });
  if (!coupon) throw new ApiError(404, "Invalid coupon code");

  const cart = await Cart.findOne({ user: req.user!._id }).populate("items.product");
  if (!cart || cart.items.length === 0) throw new ApiError(400, "Cart is empty");

  const lines = cart.items.map((item) => {
    const product = item.product as unknown as { _id: string; price: number; category: string };
    return { product: product._id.toString(), category: product.category?.toString(), price: product.price, quantity: item.quantity };
  });
  const cartTotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  const discount = computeCouponDiscount(coupon, req.user!._id.toString(), lines, cartTotal);

  res.json({ success: true, data: { code: coupon.code, discount, cartTotal } });
});
