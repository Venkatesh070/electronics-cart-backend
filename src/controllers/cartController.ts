import { Request, Response } from "express";
import { Cart } from "../models/Cart";
import { Product } from "../models/Product";
import { Coupon } from "../models/Coupon";
import { GiftCard } from "../models/GiftCard";
import { Wishlist } from "../models/Wishlist";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { computeCouponDiscount } from "../utils/couponPricing";
import { computeShippingFee, computeTax } from "../utils/orderPricing";
import { resolveUnitPrice } from "../utils/variants";

async function getOrCreateCart(userId: string) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }
  return cart;
}

function sameLine(item: { product: { toString(): string }; variantSku?: string }, productId: string, variantSku?: string) {
  const sku = variantSku ? String(variantSku).toUpperCase() : undefined;
  const itemSku = item.variantSku ? String(item.variantSku).toUpperCase() : undefined;
  return item.product.toString() === productId && itemSku === sku;
}

export const getCart = asyncHandler(async (req: Request, res: Response) => {
  const cart = await getOrCreateCart(req.user!._id.toString());
  await cart.populate("items.product");
  res.json({ success: true, data: cart });
});

export const addItem = asyncHandler(async (req: Request, res: Response) => {
  const { productId, quantity = 1, variantSku } = req.body;
  if (!productId) throw new ApiError(400, "productId is required");

  const product = await Product.findById(productId);
  if (!product) throw new ApiError(404, "Product not found");

  const resolved = resolveUnitPrice(product, variantSku);
  if (resolved.stock <= 0) throw new ApiError(400, "Selected option is out of stock");
  if (product.variants?.length && !resolved.variant) {
    throw new ApiError(400, "variantSku is required for this product");
  }

  const sku = resolved.variant?.sku;
  const cart = await getOrCreateCart(req.user!._id.toString());
  const existingItem = cart.items.find((item) => sameLine(item, productId, sku));
  const nextQty = (existingItem?.quantity || 0) + Number(quantity || 1);
  const maxQty = resolved.variant?.maxOrderQty
    ? Math.min(resolved.stock, resolved.variant.maxOrderQty)
    : resolved.stock;
  if (nextQty > maxQty) {
    throw new ApiError(400, `Only ${maxQty} unit(s) available`);
  }

  if (existingItem) {
    existingItem.quantity = nextQty;
  } else {
    cart.items.push({
      product: product._id,
      variantSku: sku,
      quantity: Number(quantity || 1),
    });
  }

  await cart.save();
  await cart.populate("items.product");
  res.json({ success: true, data: cart });
});

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const { productId } = req.params;
  const { quantity, variantSku } = req.body;

  if (!quantity || quantity < 1) throw new ApiError(400, "quantity must be at least 1");

  const product = await Product.findById(productId);
  if (!product) throw new ApiError(404, "Product not found");

  const cart = await getOrCreateCart(req.user!._id.toString());
  const item =
    cart.items.find((i) => sameLine(i, productId, variantSku ?? i.variantSku)) ||
    cart.items.find((i) => i.product.toString() === productId);
  if (!item) throw new ApiError(404, "Item not found in cart");

  const resolved = resolveUnitPrice(product, item.variantSku || variantSku);
  if (resolved.stock <= 0) throw new ApiError(400, "Selected option is out of stock");
  const maxQty = resolved.variant?.maxOrderQty
    ? Math.min(resolved.stock, resolved.variant.maxOrderQty)
    : resolved.stock;
  if (quantity > maxQty) throw new ApiError(400, `Only ${maxQty} unit(s) available`);

  item.quantity = quantity;
  await cart.save();
  await cart.populate("items.product");
  res.json({ success: true, data: cart });
});

export const removeItem = asyncHandler(async (req: Request, res: Response) => {
  const { productId } = req.params;
  const variantSku = typeof req.query.variantSku === "string" ? req.query.variantSku : undefined;
  const cart = await getOrCreateCart(req.user!._id.toString());

  if (variantSku) {
    cart.items = cart.items.filter((i) => !sameLine(i, productId, variantSku));
  } else {
    cart.items = cart.items.filter((i) => i.product.toString() !== productId);
  }

  await cart.save();
  await cart.populate("items.product");
  res.json({ success: true, data: cart });
});

export const clearCart = asyncHandler(async (req: Request, res: Response) => {
  const cart = await getOrCreateCart(req.user!._id.toString());
  cart.items = [];
  cart.couponCode = undefined;
  cart.giftCards = [];
  await cart.save();
  res.json({ success: true, data: cart });
});

export const applyCoupon = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) throw new ApiError(400, "code is required");

  const coupon = await Coupon.findOne({ code: code.toUpperCase() });
  if (!coupon) throw new ApiError(404, "Invalid coupon code");

  const cart = await getOrCreateCart(req.user!._id.toString());
  await cart.populate("items.product");
  if (cart.items.length === 0) throw new ApiError(400, "Cart is empty");

  const lines = cart.items.map((item) => {
    const product = item.product as unknown as Parameters<typeof resolveUnitPrice>[0];
    const { price } = resolveUnitPrice(product, item.variantSku);
    return {
      product: product._id.toString(),
      category: (product as { category?: { toString(): string } }).category?.toString(),
      price,
      quantity: item.quantity,
    };
  });
  const cartTotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  computeCouponDiscount(coupon, req.user!._id.toString(), lines, cartTotal);

  cart.couponCode = coupon.code;
  await cart.save();
  res.json({ success: true, data: cart });
});

export const removeCoupon = asyncHandler(async (req: Request, res: Response) => {
  const cart = await getOrCreateCart(req.user!._id.toString());
  cart.couponCode = undefined;
  await cart.save();
  res.json({ success: true, data: cart });
});

export const getCartSummary = asyncHandler(async (req: Request, res: Response) => {
  const cart = await getOrCreateCart(req.user!._id.toString());
  await cart.populate("items.product");

  const lines = cart.items.map((item) => {
    const product = item.product as unknown as Parameters<typeof resolveUnitPrice>[0];
    const { price } = resolveUnitPrice(product, item.variantSku);
    return {
      product: product._id.toString(),
      category: (product as { category?: { toString(): string } }).category?.toString(),
      price,
      quantity: item.quantity,
    };
  });
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  let discount = 0;
  if (cart.couponCode) {
    const coupon = await Coupon.findOne({ code: cart.couponCode });
    if (coupon) {
      try {
        discount = computeCouponDiscount(coupon, req.user!._id.toString(), lines, subtotal);
      } catch {
        discount = 0;
      }
    }
  }

  let giftCardTotal = 0;
  for (const gc of cart.giftCards) {
    const card = await GiftCard.findOne({ code: gc.code, status: "active" });
    if (card) giftCardTotal += Math.min(card.balance, subtotal - discount - giftCardTotal);
  }

  const state = (req.query.state as string) || "";
  const shippingFee = state ? await computeShippingFee(state, subtotal - discount) : 0;
  const tax = state ? await computeTax(state, undefined, subtotal - discount) : 0;
  const total = Math.max(0, subtotal - discount - giftCardTotal + tax + shippingFee);

  res.json({
    success: true,
    data: { subtotal, discount, giftCardTotal, tax, shippingFee, total, couponCode: cart.couponCode },
  });
});

export const applyGiftCard = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) throw new ApiError(400, "code is required");

  const giftCard = await GiftCard.findOne({ code: code.toUpperCase(), status: "active" });
  if (!giftCard) throw new ApiError(404, "Invalid or inactive gift card code");
  if (giftCard.balance <= 0) throw new ApiError(400, "This gift card has no remaining balance");

  const cart = await getOrCreateCart(req.user!._id.toString());
  if (cart.giftCards.some((gc) => gc.code === giftCard.code)) {
    throw new ApiError(409, "This gift card is already applied");
  }

  cart.giftCards.push({ code: giftCard.code, amountApplied: giftCard.balance });
  await cart.save();
  res.json({ success: true, data: cart });
});

export const removeGiftCard = asyncHandler(async (req: Request, res: Response) => {
  const cart = await getOrCreateCart(req.user!._id.toString());
  cart.giftCards = cart.giftCards.filter((gc) => gc.code !== req.params.code.toUpperCase());
  await cart.save();
  res.json({ success: true, data: cart });
});

export const moveToWishlist = asyncHandler(async (req: Request, res: Response) => {
  const { productId } = req.params;
  const userId = req.user!._id.toString();

  const cart = await getOrCreateCart(userId);
  const item = cart.items.find((i) => i.product.toString() === productId);
  if (!item) throw new ApiError(404, "Item not found in cart");

  const product = await Product.findById(productId);
  if (!product) throw new ApiError(404, "Product not found");

  let wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) wishlist = await Wishlist.create({ user: userId, items: [] });

  if (!wishlist.items.some((i) => i.product.toString() === productId)) {
    wishlist.items.push({ product: product._id, addedAt: new Date(), priceWhenAdded: product.price });
    await wishlist.save();
  }

  cart.items = cart.items.filter((i) => i.product.toString() !== productId);
  await cart.save();
  await cart.populate("items.product");
  await wishlist.populate("items.product");

  res.json({ success: true, data: { cart, wishlist } });
});

/** Cross-sell: popular products in the same categories as cart items. */
export const getCartRecommendations = asyncHandler(async (req: Request, res: Response) => {
  const cart = await getOrCreateCart(req.user!._id.toString());
  await cart.populate("items.product");

  const cartProductIds = cart.items.map((i) => i.product._id || i.product);
  const categories = [
    ...new Set(
      cart.items
        .map((i) => (i.product as unknown as { category?: string })?.category?.toString())
        .filter(Boolean)
    ),
  ];

  const filter: Record<string, unknown> = {
    status: { $in: ["ACTIVE", "published"] },
    _id: { $nin: cartProductIds },
  };
  if (categories.length) filter.category = { $in: categories };

  const products = await Product.find(filter)
    .sort({ ratingsCount: -1, ratingsAverage: -1 })
    .limit(8)
    .populate("brand", "name slug logo");

  res.json({ success: true, data: products });
});
