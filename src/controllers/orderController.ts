import { Request, Response } from "express";
import { Cart } from "../models/Cart";
import { IOrder, Order, OrderStatus } from "../models/Order";
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
import { pushOrderToShiprocket, syncShiprocketOrder, getShiprocketLabelUrl, getShiprocketInvoiceUrl } from "../services/shiprocket";
import { resolveUnitPrice } from "../utils/variants";
import { IProduct } from "../models/Product";
import { getEnabledPaymentMethods } from "./paymentSettingsController";

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const { addressId, shippingAddress: shippingAddressBody, deliverySlot, paymentMethod } = req.body;

  const enabledMethods = await getEnabledPaymentMethods();
  const methodId = String(paymentMethod || "").trim() || (enabledMethods[0]?.id ?? "COD");
  if (!enabledMethods.some((m) => m.id === methodId)) {
    throw new ApiError(400, "Selected payment method is not available");
  }

  let shippingAddress = shippingAddressBody;
  if (addressId) {
    const address = await Address.findOne({ _id: addressId, user: req.user!._id });
    if (!address) throw new ApiError(404, "Address not found");
    shippingAddress = {
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
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
    const product = item.product as unknown as IProduct | null;

    if (!product || typeof product !== "object" || !("_id" in product)) {
      throw new ApiError(400, "A product in your cart is no longer available. Please refresh your cart.");
    }

    const resolved = resolveUnitPrice(product, item.variantSku);
    if (resolved.stock < item.quantity) {
      throw new ApiError(400, `Insufficient stock for ${product.name}`);
    }
    const displayName = resolved.variant
      ? `${product.name} (${resolved.variant.label})`
      : product.name;

    orderItems.push({
      product: product._id,
      name: displayName,
      price: resolved.price,
      quantity: item.quantity,
      variantSku: resolved.variant?.sku,
      variantLabel: resolved.variant?.label,
    });
    lines.push({
      product: product._id.toString(),
      category: product.category?.toString(),
      price: resolved.price,
      quantity: item.quantity,
    });
    subtotal += resolved.price * item.quantity;
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

  // Reserve stock and gift-card balance atomically (findOneAndUpdate with a
  // quantity/balance guard) so two concurrent checkouts can't both succeed
  // against the same last unit or the same last rupee of a gift card. If
  // anything fails before the order is durably created, roll back whatever
  // was already reserved.
  const reservedStock: { productId: string; quantity: number; variantSku?: string }[] = [];
  const reservedGiftCards: { code: string; amount: number }[] = [];
  const giftCardsApplied: { code: string; amountApplied: number }[] = [];
  let totalAmount = 0;
  let online = false;
  let order: IOrder | undefined;

  async function rollbackReservations() {
    await Promise.all([
      ...reservedStock.map(async (r) => {
        if (r.variantSku) {
          await Product.findOneAndUpdate(
            { _id: r.productId, "variants.sku": r.variantSku },
            { $inc: { "variants.$.stock": r.quantity, stock: r.quantity } }
          );
        } else {
          await Product.findByIdAndUpdate(r.productId, { $inc: { stock: r.quantity } });
        }
      }),
      ...reservedGiftCards.map((g) => GiftCard.findOneAndUpdate({ code: g.code }, { $inc: { balance: g.amount } })),
    ]);
  }

  try {
    for (const item of cart.items) {
      const product = item.product as unknown as IProduct;
      const sku = item.variantSku ? String(item.variantSku).toUpperCase() : undefined;
      let updated;
      if (sku && product.variants?.length) {
        updated = await Product.findOneAndUpdate(
          { _id: product._id, variants: { $elemMatch: { sku, stock: { $gte: item.quantity } } } },
          { $inc: { "variants.$[v].stock": -item.quantity, stock: -item.quantity } },
          { arrayFilters: [{ "v.sku": sku }], new: true }
        );
      } else {
        updated = await Product.findOneAndUpdate(
          { _id: product._id, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } }
        );
      }
      if (!updated) {
        throw new ApiError(400, `Insufficient stock for ${product.name}`);
      }
      reservedStock.push({ productId: product._id.toString(), quantity: item.quantity, variantSku: sku });
    }

    let remaining = Math.max(0, subtotal - discount + shippingFee + tax);
    for (const gc of cart.giftCards) {
      if (remaining <= 0) break;
      const card = await GiftCard.findOne({ code: gc.code, status: "active" });
      if (!card || card.balance <= 0) continue;
      const amountApplied = Math.min(card.balance, remaining);
      const updated = await GiftCard.findOneAndUpdate(
        { code: card.code, status: "active", balance: { $gte: amountApplied } },
        { $inc: { balance: -amountApplied } }
      );
      if (!updated) continue; // lost the race to another checkout — skip this card
      reservedGiftCards.push({ code: card.code, amount: amountApplied });
      giftCardsApplied.push({ code: card.code, amountApplied });
      remaining -= amountApplied;
    }

    totalAmount = Math.max(0, remaining);
    online = isOnlinePaymentMethod(methodId);

    order = await Order.create({
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
      paymentMethod: online ? String(methodId || "razorpay") : String(methodId || "COD"),
      paymentStatus: "pending",
      status: "pending",
      statusHistory: [{ status: "pending", at: new Date() }],
    });
  } catch (err) {
    await rollbackReservations();
    throw err;
  }

  // Order is durably created past this point — no more rollback of stock/gift-card reservations.
  if (appliedCoupon) {
    await Coupon.findOneAndUpdate(
      { code: appliedCoupon },
      { $push: { redemptions: { user: userId, order: order._id, redeemedAt: new Date() } } }
    );
  }

  cart.items = [];
  cart.couponCode = undefined;
  cart.giftCards = [];
  await cart.save();

  await notifyUser(userId, "order_update", "Order placed", `Your order #${order._id.toString().slice(-6)} has been placed.`, order._id.toString());

  // COD can ship immediately; prepaid waits until markOrderPaid.
  if (!online && String(order.paymentMethod || "").toUpperCase() === "COD") {
    try {
      await pushOrderToShiprocket(order);
    } catch (err) {
      console.error("Shiprocket push (COD) failed:", err);
    }
  }

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
  const orders = await Order.find({ user: req.user!._id })
    .populate("items.product", "name images slug")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: orders });
});

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await Order.findById(req.params.id).populate("items.product", "name images slug returnWindowDays");
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

  const t = order.tracking || {};
  res.json({
    success: true,
    data: {
      status: order.status,
      statusHistory: order.statusHistory,
      tracking: t,
      carrier: t.courier,
      trackingNumber: t.trackingId,
      url: t.url,
      shiprocket: order.shiprocket,
    },
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
      // Flipkart-style GST helpers for invoice PDF
      gstRate: Number(process.env.SHIPROCKET_GST_RATE) || 18,
      sellerGstin: process.env.SHIPROCKET_GSTIN || "",
      pickupState: process.env.SHIPROCKET_PICKUP_STATE || "",
      hsn: process.env.SHIPROCKET_DEFAULT_HSN || "84713000",
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
    order.items.map((item) => {
      if (item.variantSku) {
        return Product.findOneAndUpdate(
          { _id: item.product, "variants.sku": item.variantSku },
          { $inc: { "variants.$.stock": item.quantity, stock: item.quantity } }
        );
      }
      return Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
    })
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

/** Admin: create / re-push Shiprocket shipment for an order. */
export const shipWithShiprocket = asyncHandler(async (req: Request, res: Response) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, "Order not found");
  if (order.status === "cancelled") throw new ApiError(400, "Cannot ship a cancelled order");

  const { force, ewaybillNo, customerGstin } = req.body || {};
  if (ewaybillNo != null || customerGstin != null) {
    order.shiprocket = {
      ...(order.shiprocket || {}),
      ...(ewaybillNo != null ? { ewaybillNo: String(ewaybillNo).trim() } : {}),
      ...(customerGstin != null ? { customerGstin: String(customerGstin).trim() } : {}),
    };
  }

  try {
    await pushOrderToShiprocket(order, { force: Boolean(force) });
  } catch (err) {
    throw new ApiError(502, err instanceof Error ? err.message : "Shiprocket request failed");
  }

  await logAudit(req, "orders", "shiprocket:push", order._id.toString());
  res.json({ success: true, data: order });
});

function assertOrderAccess(req: Request, order: IOrder) {
  const isOwner = order.user.toString() === req.user!._id.toString();
  if (!isOwner && req.user!.role === "customer") {
    throw new ApiError(403, "Not authorized to view this order");
  }
}

/** Sync AWB after Ship Now in Shiprocket dashboard. */
export const syncShiprocket = asyncHandler(async (req: Request, res: Response) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, "Order not found");
  assertOrderAccess(req, order);
  try {
    await syncShiprocketOrder(order);
  } catch (err) {
    throw new ApiError(502, err instanceof Error ? err.message : "Shiprocket sync failed");
  }
  res.json({ success: true, data: order });
});

/** Download shipping label (PDF URL from Shiprocket). */
export const downloadShiprocketLabel = asyncHandler(async (req: Request, res: Response) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, "Order not found");
  assertOrderAccess(req, order);
  try {
    const url = await getShiprocketLabelUrl(order);
    res.json({ success: true, data: { url, type: "label" } });
  } catch (err) {
    throw new ApiError(502, err instanceof Error ? err.message : "Could not get shipping label");
  }
});

/** Download Shiprocket invoice (PDF URL). */
export const downloadShiprocketInvoice = asyncHandler(async (req: Request, res: Response) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, "Order not found");
  assertOrderAccess(req, order);
  try {
    const url = await getShiprocketInvoiceUrl(order);
    res.json({ success: true, data: { url, type: "invoice" } });
  } catch (err) {
    throw new ApiError(502, err instanceof Error ? err.message : "Could not get Shiprocket invoice");
  }
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
