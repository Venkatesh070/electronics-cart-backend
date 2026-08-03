import { ICoupon } from "../models/Coupon";
import { ApiError } from "./ApiError";

interface CartLine {
  product: string;
  category?: string;
  price: number;
  quantity: number;
}

export function computeCouponDiscount(
  coupon: ICoupon,
  userId: string,
  lines: CartLine[],
  cartTotal: number
): number {
  const now = new Date();
  if (!coupon.active) throw new ApiError(400, "This coupon is no longer active");
  if (now < coupon.validFrom || now > coupon.validTo) throw new ApiError(400, "This coupon has expired");
  if (cartTotal < coupon.minOrderValue) {
    throw new ApiError(400, `Minimum order value for this coupon is ${coupon.minOrderValue}`);
  }
  if (coupon.usageLimit && coupon.redemptions.length >= coupon.usageLimit) {
    throw new ApiError(400, "This coupon has reached its usage limit");
  }
  const userRedemptions = coupon.redemptions.filter((r) => r.user.toString() === userId).length;
  if (userRedemptions >= coupon.perUserLimit) {
    throw new ApiError(400, "You have already used this coupon the maximum number of times");
  }

  let eligibleTotal = cartTotal;
  if (coupon.applicableCategories.length > 0 || coupon.applicableProducts.length > 0) {
    const categoryIds = new Set(coupon.applicableCategories.map((c) => c.toString()));
    const productIds = new Set(coupon.applicableProducts.map((p) => p.toString()));
    eligibleTotal = lines
      .filter((l) => productIds.has(l.product) || (l.category && categoryIds.has(l.category)))
      .reduce((sum, l) => sum + l.price * l.quantity, 0);

    if (eligibleTotal <= 0) {
      throw new ApiError(400, "No items in your cart are eligible for this coupon");
    }
  }

  const discount = coupon.type === "flat" ? coupon.value : (eligibleTotal * coupon.value) / 100;
  return Math.min(discount, eligibleTotal);
}
