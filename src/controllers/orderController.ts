import { Request, Response } from "express";
import { Cart } from "../models/Cart";
import { Order, OrderStatus } from "../models/Order";
import { Product } from "../models/Product";
import { Coupon } from "../models/Coupon";
import { GiftCard } from "../models/GiftCard";
import { Address } from "../models/Address";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { computeCouponDiscount } from "../utils/couponPricing";
import { computeShippingFee, computeTax } from "../utils/orderPricing";
import { logAudit } from "../utils/auditLog";
import { notifyUser } from "../utils/notify";
import {
  getRazorpay,
  getRazorpayKeyId,
  isOnlinePaymentMethod,
  isRazorpayConfigured,
  toPaise,
} from "../config/razorpay";

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const { addressId, shippingAddress: shippingAddressBody, deliverySlot, paymentMethod } = req.body;

  let shippingAddress = shippingAddressBody;
  if (addressId) {
    const address = await Address.findOne({ _id: addressId, user: req.user!._id });
    if (!address) throw new ApiError(404, "Address not found");
    shippingAddress = {
      fullName: address.fullName,
      line1: address.line1,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
    };
  }
  if (!shippingAddress) throw new ApiError(400, "addressId or shippingAddress is required");

  const userId = req.user!._id.toString();
  const cart = await Cart.findOne({ user: userId }).populate("items.product");

  if (!cart || cart.items.length === 0) {
    throw new ApiError(400, "Cart is empty");
  }

  const orderItems = [];
  let subtotal = 0;
  const lines = [];

  for (const item of cart.items) {
    const product = item.product as unknown as {
      _id: string;
      name: string;
      price: number;
      stock: number;
      category: string;
    } | null;

    // Populate leaves null when the product was deleted
    if (!product || typeof product !== "object" || !("_id" in product)) {
      throw new ApiError(400, "A product in your cart is no longer available. Please refresh your cart.");
    }

    if (product.stock < item.quantity) {
      throw new ApiError(400, `Insufficient stock for ${product.name}`);
    }

    orderItems.push({
      product: product._id,
      name: product.name,
      price: product.price,
      quantity: item.quantity,
    });
    lines.push({
      product: product._id.toString(),
      category: product.category?.toString(),
      price: product.price,
      quantity: item.quantity,
    });
    subtotal += product.price * item.quantity;
  }

  let discount = 0;
  let appliedCoupon: string | undefined;
  if (cart.couponCode) {
    const coupon = await Coupon.findOne({ code: cart.couponCode });
    if (coupon) {
      discount = computeCouponDiscount(coupon, userId, lines, subtotal);
      appliedCoupon = coupon.code;
    }
  }

  const shippingFee = await computeShippingFee(shippingAddress.state, subtotal - discount);
  const tax = await computeTax(shippingAddress.state, undefined, subtotal - discount);

  const giftCardsApplied: { code: string; amountApplied: number }[] = [];
  let remaining = Math.max(0, subtotal - discount + shippingFee + tax);
  for (const gc of cart.giftCards) {
    if (remaining <= 0) break;
    const card = await GiftCard.findOne({ code: gc.code, status: "active" });
    if (!card || card.balance <= 0) continue;
    const amountApplied = Math.min(card.balance, remaining);
    giftCardsApplied.push({ code: card.code, amountApplied });
    remaining -= amountApplied;
  }

  const totalAmount = Math.max(0, remaining);
  const online = isOnlinePaymentMethod(paymentMethod);

  const order = await Order.create({
    user: userId,
    items: orderItems,
    subtotal,
    discount,
    tax,
    shippingFee,
    totalAmount,
    couponCode: appliedCoupon,
    giftCardsApplied,
    shippingAddress,
    deliverySlot,
    paymentMethod: online ? String(paymentMethod || "razorpay") : String(paymentMethod || "COD"),
    paymentStatus: "pending",
    status: "pending",
    statusHistory: [{ status: "pending", at: new Date() }],
  });

  await Promise.all([
    ...cart.items.map((item) =>
      Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity } })
    ),
    appliedCoupon
      ? Coupon.findOneAndUpdate(
          { code: appliedCoupon },
          { $push: { redemptions: { user: userId, order: order._id, redeemedAt: new Date() } } }
        )
      : Promise.resolve(),
    ...giftCardsApplied.map((gc) =>
      GiftCard.findOneAndUpdate({ code: gc.code }, { $inc: { balance: -gc.amountApplied } })
    ),
  ]);

  cart.items = [];
  cart.couponCode = undefined;
  cart.giftCards = [];
  await cart.save();

  await notifyUser(userId, "order_update", "Order placed", `Your order #${order._id.toString().slice(-6)} has been placed.`, order._id.toString());

  let razorpay: Record<string, unknown> | null = null;
  if (online) {
    try {
      if (!isRazorpayConfigured() && process.env.PAYMENTS_MOCK !== "true") {
        throw new Error("Razorpay is not configured");
      }

      const amountPaise = toPaise(order.totalAmount);
      if (amountPaise < 100) {
        throw new Error("Order total must be at least ₹1 for online payment");
      }

      if (process.env.PAYMENTS_MOCK === "true") {
        const mockId = `order_mock_${order._id.toString()}`;
        order.razorpayOrderId = mockId;
        await order.save();
        razorpay = {
          keyId: "rzp_test_mock",
          razorpayOrderId: mockId,
          amount: amountPaise,
          currency: process.env.PAYMENTS_DEFAULT_CURRENCY || "INR",
          orderId: order._id,
          mock: true,
        };
      } else {
        const rz = getRazorpay();
        const rzOrder = await rz.orders.create({
          amount: amountPaise,
          currency: process.env.PAYMENTS_DEFAULT_CURRENCY || "INR",
          receipt: `ord_${order._id.toString().slice(-12)}`,
          notes: {
            orderId: order._id.toString(),
            userId,
          },
        });
        order.razorpayOrderId = rzOrder.id;
        await order.save();
        razorpay = {
          keyId: getRazorpayKeyId(),
          razorpayOrderId: rzOrder.id,
          amount: amountPaise,
          currency: rzOrder.currency || "INR",
          orderId: order._id,
        };
      }
    } catch (err) {
      console.error("Razorpay order create failed:", err);
      // Order is already placed — client can retry via /api/payments/razorpay/create-order
      razorpay = {
        orderId: order._id,
        error: err instanceof Error ? err.message : "Could not start Razorpay checkout",
      };
    }
  }

  res.status(201).json({ success: true, data: order, razorpay });
});

export const listMyOrders = asyncHandler(async (req: Request, res: Response) => {
  const orders = await Order.find({ user: req.user!._id }).sort({ createdAt: -1 });
  res.json({ success: true, data: orders });
});

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await Order.findById(req.params.id).populate("items.product", "name images slug");
  if (!order) throw new ApiError(404, "Order not found");

  const isOwner = order.user.toString() === req.user!._id.toString();
  if (!isOwner && req.user!.role === "customer") {
    throw new ApiError(403, "Not authorized to view this order");
  }

  res.json({ success: true, data: order });
});

export const getOrderTracking = asyncHandler(async (req: Request, res: Response) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, "Order not found");

  const isOwner = order.user.toString() === req.user!._id.toString();
  if (!isOwner && req.user!.role === "customer") {
    throw new ApiError(403, "Not authorized to view this order");
  }

  res.json({
    success: true,
    data: { status: order.status, statusHistory: order.statusHistory, tracking: order.tracking },
  });
});

export const getOrderInvoice = asyncHandler(async (req: Request, res: Response) => {
  const order = await Order.findById(req.params.id).populate("user", "name email");
  if (!order) throw new ApiError(404, "Order not found");

  const isOwner = order.user._id.toString() === req.user!._id.toString();
  if (!isOwner && req.user!.role === "customer") {
    throw new ApiError(403, "Not authorized to view this order");
  }

  res.json({
    success: true,
    data: {
      invoiceNumber: `INV-${order._id.toString().slice(-8).toUpperCase()}`,
      issuedAt: order.createdAt,
      customer: order.user,
      billingAddress: order.shippingAddress,
      items: order.items,
      subtotal: order.subtotal,
      discount: order.discount,
      tax: order.tax,
      shippingFee: order.shippingFee,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
    },
  });
});

export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const { reason } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, "Order not found");

  const isOwner = order.user.toString() === req.user!._id.toString();
  if (!isOwner) throw new ApiError(403, "Not authorized to cancel this order");
  if (!["pending", "confirmed", "paid"].includes(order.status)) {
    throw new ApiError(400, `Order cannot be cancelled once it is ${order.status}`);
  }

  order.status = "cancelled";
  order.cancelReason = reason;
  order.statusHistory.push({ status: "cancelled", note: reason, at: new Date() });
  await order.save();

  await Promise.all(
    order.items.map((item) => Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } }))
  );

  res.json({ success: true, data: order });
});

export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status, note, courier, trackingId, url } = req.body;
  const validStatuses: OrderStatus[] = [
    "pending",
    "confirmed",
    "paid",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ];

  if (!validStatuses.includes(status)) {
    throw new ApiError(400, `status must be one of: ${validStatuses.join(", ")}`);
  }

  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, "Order not found");

  order.status = status;
  order.statusHistory.push({ status, note, at: new Date() });
  if (courier || trackingId || url) {
    order.tracking = { courier: courier || order.tracking?.courier, trackingId: trackingId || order.tracking?.trackingId, url: url || order.tracking?.url };
  }
  await order.save();

  await logAudit(req, "orders", `status:${status}`, order._id.toString());
  await notifyUser(
    order.user.toString(),
    "order_update",
    "Order status updated",
    `Your order #${order._id.toString().slice(-6)} is now ${status}.`,
    order._id.toString()
  );

  res.json({ success: true, data: order });
});

// --- Admin ---

export const adminListOrders = asyncHandler(async (req: Request, res: Response) => {
  const { status, paymentMethod, from, to, search, page = "1", limit = "20" } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};

  if (status) filter.status = status;
  if (paymentMethod) filter.paymentMethod = paymentMethod;
  if (from || to) {
    filter.createdAt = {} as Record<string, Date>;
    if (from) (filter.createdAt as Record<string, Date>).$gte = new Date(from);
    if (to) (filter.createdAt as Record<string, Date>).$lte = new Date(to);
  }
  if (search) filter._id = search.match(/^[a-f0-9]{24}$/i) ? search : undefined;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Order.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: orders,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

/** Re-add all items from a past order into the user's cart. */
export const reorder = asyncHandler(async (req: Request, res: Response) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, "Order not found");
  if (order.user.toString() !== req.user!._id.toString()) {
    throw new ApiError(403, "Not authorized to reorder this order");
  }

  let cart = await Cart.findOne({ user: req.user!._id });
  if (!cart) cart = await Cart.create({ user: req.user!._id, items: [] });

  for (const item of order.items) {
    const product = await Product.findById(item.product);
    if (!product || !["ACTIVE", "published"].includes(product.status) || product.stock < 1) continue;

    const existing = cart.items.find((i) => i.product.toString() === item.product.toString());
    const qty = Math.min(item.quantity, product.stock);
    if (existing) existing.quantity = Math.min(existing.quantity + qty, product.stock);
    else cart.items.push({ product: item.product, quantity: qty });
  }

  await cart.save();
  await cart.populate("items.product");
  res.json({ success: true, data: cart });
});
