import { Request, Response } from "express";
import { IOrder, Order } from "../models/Order";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import {
  getRazorpay,
  getRazorpayKeyId,
  isOnlinePaymentMethod,
  isRazorpayConfigured,
  isWebhookConfigured,
  toPaise,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "../config/razorpay";
import { notifyUser } from "../utils/notify";
import { pushOrderToShiprocket } from "../services/shiprocket";
import { getEnabledPaymentMethods } from "./paymentSettingsController";

export const getPaymentConfig = asyncHandler(async (_req: Request, res: Response) => {
  const methods = await getEnabledPaymentMethods();
  res.json({
    success: true,
    data: {
      provider: "razorpay",
      configured: isRazorpayConfigured(),
      keyId: isRazorpayConfigured() ? getRazorpayKeyId() : null,
      currency: process.env.PAYMENTS_DEFAULT_CURRENCY || "INR",
      mock: process.env.PAYMENTS_MOCK === "true",
      methods,
    },
  });
});

/**
 * Create (or reuse) a Razorpay order for an existing unpaid shop order.
 */
export const createRazorpayOrder = asyncHandler(async (req: Request, res: Response) => {
  const orderId = req.params.orderId || req.body.orderId;
  if (!orderId) throw new ApiError(400, "orderId is required");

  const order = await Order.findOne({ _id: orderId, user: req.user!._id });
  if (!order) throw new ApiError(404, "Order not found");
  if (order.paymentStatus === "paid") throw new ApiError(400, "Order is already paid");
  if (order.status === "cancelled") throw new ApiError(400, "Order is cancelled");

  if (!isOnlinePaymentMethod(order.paymentMethod) && !isOnlinePaymentMethod(req.body.paymentMethod)) {
    order.paymentMethod = "razorpay";
  }

  const amountPaise = toPaise(order.totalAmount);
  if (amountPaise < 100) throw new ApiError(400, "Order total must be at least ₹1 for online payment");

  if (process.env.PAYMENTS_MOCK === "true") {
    const mockId = `order_mock_${order._id.toString()}`;
    order.razorpayOrderId = mockId;
    await order.save();
    return res.json({
      success: true,
      data: {
        keyId: "rzp_test_mock",
        razorpayOrderId: mockId,
        amount: amountPaise,
        currency: process.env.PAYMENTS_DEFAULT_CURRENCY || "INR",
        orderId: order._id,
        mock: true,
      },
    });
  }

  const razorpay = getRazorpay();

  if (order.razorpayOrderId) {
    return res.json({
      success: true,
      data: {
        keyId: getRazorpayKeyId(),
        razorpayOrderId: order.razorpayOrderId,
        amount: amountPaise,
        currency: process.env.PAYMENTS_DEFAULT_CURRENCY || "INR",
        orderId: order._id,
      },
    });
  }

  const rzOrder = await razorpay.orders.create({
    amount: amountPaise,
    currency: process.env.PAYMENTS_DEFAULT_CURRENCY || "INR",
    receipt: `ord_${order._id.toString().slice(-12)}`,
    notes: {
      orderId: order._id.toString(),
      userId: req.user!._id.toString(),
    },
  });

  order.razorpayOrderId = rzOrder.id;
  if (!order.paymentMethod || order.paymentMethod === "COD") order.paymentMethod = "razorpay";
  await order.save();

  res.json({
    success: true,
    data: {
      keyId: getRazorpayKeyId(),
      razorpayOrderId: rzOrder.id,
      amount: amountPaise,
      currency: rzOrder.currency || "INR",
      orderId: order._id,
    },
  });
});

/** Marks an order paid and notifies the customer. Idempotent — safe to call twice for the same order. */
async function markOrderPaid(order: IOrder, razorpayOrderId: string, razorpayPaymentId: string, note: string) {
  if (order.paymentStatus === "paid") return;

  order.paymentStatus = "paid";
  order.razorpayOrderId = razorpayOrderId;
  order.razorpayPaymentId = razorpayPaymentId;
  order.paymentMethod = order.paymentMethod || "razorpay";
  if (order.status === "pending") {
    order.status = "paid";
    order.statusHistory.push({ status: "paid", note, at: new Date() });
  }
  await order.save();

  await notifyUser(
    order.user.toString(),
    "order_update",
    "Payment successful",
    `Payment received for order #${order._id.toString().slice(-6)}.`,
    order._id.toString()
  );

  try {
    await pushOrderToShiprocket(order);
  } catch (err) {
    console.error("Shiprocket push (paid) failed:", err);
  }
}

export const verifyRazorpayPayment = asyncHandler(async (req: Request, res: Response) => {
  const {
    orderId,
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature,
  } = req.body as Record<string, string>;

  if (!orderId || !razorpayOrderId || !razorpayPaymentId) {
    throw new ApiError(400, "orderId, razorpay_order_id and razorpay_payment_id are required");
  }

  const order = await Order.findOne({ _id: orderId, user: req.user!._id });
  if (!order) throw new ApiError(404, "Order not found");
  if (order.paymentStatus === "paid") {
    return res.json({ success: true, data: order, message: "Already paid" });
  }

  if (order.razorpayOrderId && order.razorpayOrderId !== razorpayOrderId) {
    throw new ApiError(400, "Razorpay order does not match this shop order");
  }

  if (process.env.PAYMENTS_MOCK === "true" && String(razorpayOrderId).startsWith("order_mock_")) {
    // skip signature in mock mode
  } else {
    if (!razorpaySignature) throw new ApiError(400, "razorpay_signature is required");
    verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
  }

  if (process.env.PAYMENTS_SERVER_CAPTURE === "true" && process.env.PAYMENTS_MOCK !== "true") {
    try {
      const razorpay = getRazorpay();
      const payment = await razorpay.payments.fetch(razorpayPaymentId);
      if (payment.status === "authorized") {
        await razorpay.payments.capture(razorpayPaymentId, payment.amount as number, payment.currency as string);
      }
    } catch (err) {
      console.error("Razorpay capture warning:", err);
    }
  }

  await markOrderPaid(order, razorpayOrderId, razorpayPaymentId, "Payment received via Razorpay");

  res.json({ success: true, data: order });
});

export const markPaymentFailed = asyncHandler(async (req: Request, res: Response) => {
  const { orderId, reason } = req.body as { orderId?: string; reason?: string };
  if (!orderId) throw new ApiError(400, "orderId is required");

  const order = await Order.findOne({ _id: orderId, user: req.user!._id });
  if (!order) throw new ApiError(404, "Order not found");
  if (order.paymentStatus === "paid") throw new ApiError(400, "Order is already paid");

  order.paymentStatus = "failed";
  order.statusHistory.push({
    status: order.status,
    note: reason || "Payment cancelled or failed",
    at: new Date(),
  });
  await order.save();

  res.json({ success: true, data: order });
});

interface RazorpayWebhookPayload {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        error_description?: string;
      };
    };
  };
}

/**
 * Server-to-server payment confirmation. Without this, an order only gets marked
 * paid if the customer's browser stays open long enough to call /razorpay/verify —
 * if the tab closes right after payment, the order is stuck "pending" forever.
 * Mounted with a raw body parser in app.ts (before express.json()) because the
 * webhook signature is an HMAC over the exact request bytes Razorpay sent.
 */
export const razorpayWebhook = asyncHandler(async (req: Request, res: Response) => {
  if (!isWebhookConfigured()) {
    throw new ApiError(501, "Razorpay webhook is not configured");
  }

  const rawBody = req.body as Buffer;
  verifyWebhookSignature(rawBody, req.header("x-razorpay-signature"));

  const event = JSON.parse(rawBody.toString("utf8")) as RazorpayWebhookPayload;
  const payment = event.payload?.payment?.entity;
  const razorpayOrderId = payment?.order_id;
  const razorpayPaymentId = payment?.id;

  // Ack unrecognized events / orders so Razorpay stops retrying — there's nothing to reconcile.
  if (!razorpayOrderId) return res.json({ success: true, ignored: true });
  const order = await Order.findOne({ razorpayOrderId });
  if (!order) return res.json({ success: true, ignored: true });

  if ((event.event === "payment.captured" || event.event === "order.paid") && razorpayPaymentId) {
    await markOrderPaid(order, razorpayOrderId, razorpayPaymentId, "Payment confirmed via Razorpay webhook");
  } else if (event.event === "payment.failed" && order.paymentStatus !== "paid") {
    order.paymentStatus = "failed";
    order.statusHistory.push({
      status: order.status,
      note: payment?.error_description || "Payment failed (Razorpay webhook)",
      at: new Date(),
    });
    await order.save();
  }

  res.json({ success: true });
});
