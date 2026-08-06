import { IReturn } from "../models/Return";
import { Order } from "../models/Order";
import { Product } from "../models/Product";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { logAudit } from "../utils/auditLog";
import { notifyUser } from "../utils/notify";
import {
  createShiprocketReturnOrder,
  syncShiprocketReturnOrder,
  classifyReturnShipStatus,
} from "../services/shiprocket";
import { refundRazorpayPayment } from "../services/payments";
import { Request, Response } from "express";
import { Return } from "../models/Return";

function applyReturnShipFields(
  ret: IReturn,
  fields: {
    orderId?: string;
    shipmentId?: string;
    awb?: string;
    courier?: string;
    status?: string;
    trackingUrl?: string;
    receivedAt?: Date;
  }
) {
  const next = { ...(ret.shiprocket || {}) };
  if (fields.orderId != null) next.orderId = fields.orderId;
  if (fields.shipmentId != null) next.shipmentId = fields.shipmentId;
  if (fields.awb != null) next.awb = fields.awb;
  if (fields.courier != null) next.courier = fields.courier;
  if (fields.status != null) next.status = fields.status;
  if (fields.trackingUrl != null) next.trackingUrl = fields.trackingUrl;
  if (fields.receivedAt != null) next.receivedAt = fields.receivedAt;
  if (!next.pushedAt) next.pushedAt = new Date();
  if (fields.awb && !next.trackingUrl) {
    next.trackingUrl = `https://shiprocket.co/tracking/${fields.awb}`;
  }
  ret.shiprocket = next;
}

async function pushReturnToShiprocket(ret: IReturn): Promise<IReturn> {
  if (ret.shiprocket?.orderId) return ret;

  const order = await Order.findById(ret.order);
  if (!order) throw new ApiError(404, "Order not found for return");

  const orderItem = order.items.find((i) => i.product.toString() === ret.product.toString());
  const product = await Product.findById(ret.product).select("name");
  const itemName = orderItem?.name || product?.name || "Return item";
  const unitPrice = Number(orderItem?.price) || Number(ret.refundAmount || 0) / Math.max(1, ret.quantity);

  const result = await createShiprocketReturnOrder({
    returnId: ret._id.toString(),
    order,
    itemName,
    itemSku: orderItem?.variantSku || ret.product.toString().slice(-12),
    quantity: ret.quantity,
    unitPrice,
  });

  applyReturnShipFields(ret, {
    orderId: result.orderId,
    shipmentId: result.shipmentId,
    awb: result.awb,
    courier: result.courier,
    status: result.status,
    trackingUrl: result.trackingUrl,
  });
  await ret.save();
  return ret;
}

async function restockReturnItem(ret: IReturn) {
  const order = await Order.findById(ret.order).select("items");
  const orderItem = order?.items.find((i) => i.product.toString() === ret.product.toString());
  if (orderItem?.variantSku) {
    await Product.findOneAndUpdate(
      { _id: ret.product, "variants.sku": orderItem.variantSku },
      { $inc: { "variants.$.stock": ret.quantity, stock: ret.quantity } }
    );
    return;
  }
  await Product.findByIdAndUpdate(ret.product, { $inc: { stock: ret.quantity } });
}

/**
 * When Shiprocket has delivered the return to the warehouse, auto-refund (if refund resolution).
 */
export async function finalizeReturnReceived(ret: IReturn, note?: string) {
  if (ret.status === "refunded") return { returnRequest: ret, refund: { refunded: true, skipped: "already_refunded" } };

  if (!ret.shiprocket?.receivedAt) {
    applyReturnShipFields(ret, { receivedAt: new Date() });
  }
  if (!ret.pickupDate) ret.pickupDate = new Date();

  if (ret.resolution === "replacement") {
    ret.status = "picked_up";
    await ret.save();
    await notifyUser(
      ret.user.toString(),
      "order_update",
      "Return received",
      "Your return package was received. Replacement will be arranged shortly.",
      ret._id.toString()
    );
    return { returnRequest: ret, refund: { refunded: false, skipped: "replacement" } };
  }

  // Already have a gateway refund id from a prior attempt
  if (ret.razorpayRefundId) {
    ret.status = "refunded";
    ret.refundedAt = ret.refundedAt || new Date();
    ret.refundMethod = ret.refundMethod || "razorpay";
    await ret.save();
    return { returnRequest: ret, refund: { refunded: true, refundId: ret.razorpayRefundId, skipped: "already_refunded" } };
  }

  const order = await Order.findById(ret.order);
  if (!order) throw new ApiError(404, "Order not found for refund");

  const amount = Number(ret.refundAmount) || 0;
  const refund = await refundRazorpayPayment(order, note || `Return ${ret._id.toString()} refund`, {
    amountInr: amount > 0 ? amount : undefined,
    markOrderFullyRefunded: amount > 0 && amount >= Number(order.totalAmount) - 0.01,
  });

  if (refund.refunded) {
    ret.status = "refunded";
    ret.razorpayRefundId = refund.refundId || ret.razorpayRefundId;
    ret.refundedAt = new Date();
    ret.refundMethod = "razorpay";
    await ret.save();
    await order.save();
    await restockReturnItem(ret);
    await notifyUser(
      ret.user.toString(),
      "order_update",
      "Refund initiated",
      `Your return was received and a refund of ₹${refund.amountInr ?? amount} has been initiated to your original payment method.`,
      ret._id.toString()
    );
  } else {
    // Mark picked up / received so admin can complete refund manually
    ret.status = "picked_up";
    ret.inspectionNotes = [ret.inspectionNotes, refund.error || refund.skipped || "Refund pending"]
      .filter(Boolean)
      .join(" · ");
    await ret.save();
    await notifyUser(
      ret.user.toString(),
      "order_update",
      "Return received",
      "Your return package was received. Refund will be processed shortly.",
      ret._id.toString()
    );
  }

  return { returnRequest: ret, refund };
}

/** Apply Shiprocket tracking status → picked_up / auto-refund when received. */
export async function applyShiprocketReturnUpdate(
  ret: IReturn,
  update: { awb?: string; shipmentId?: string; status?: string; courier?: string; trackingUrl?: string }
) {
  applyReturnShipFields(ret, update);
  const phase = classifyReturnShipStatus(update.status || ret.shiprocket?.status);

  if (phase === "received") {
    await ret.save();
    return finalizeReturnReceived(ret, `Shiprocket status: ${update.status || "DELIVERED"}`);
  }

  if (phase === "picked_up" && ["requested", "approved"].includes(ret.status)) {
    ret.status = "picked_up";
    if (!ret.pickupDate) ret.pickupDate = new Date();
    await ret.save();
    await notifyUser(
      ret.user.toString(),
      "order_update",
      "Return picked up",
      ret.shiprocket?.awb
        ? `Your return was picked up. Track AWB ${ret.shiprocket.awb}.`
        : "Your return was picked up by the courier.",
      ret._id.toString()
    );
  } else {
    await ret.save();
  }

  return { returnRequest: ret, refund: null };
}

export const createReturn = asyncHandler(async (req: Request, res: Response) => {
  const { orderId, productId, quantity = 1, reason, resolution } = req.body;
  if (!orderId || !productId || !reason || !resolution) {
    throw new ApiError(400, "orderId, productId, reason and resolution are required");
  }

  const resolutionNorm = String(resolution).toLowerCase();
  if (resolutionNorm !== "refund" && resolutionNorm !== "replacement") {
    throw new ApiError(400, "resolution must be refund or replacement");
  }

  const order = await Order.findOne({ _id: orderId, user: req.user!._id });
  if (!order) throw new ApiError(404, "Order not found");
  if (order.status !== "delivered") throw new ApiError(400, "Only delivered orders can be returned");

  const orderItem = order.items.find((i) => i.product.toString() === productId);
  if (!orderItem) throw new ApiError(400, "Product not found in this order");

  const qty = Math.max(1, Number(quantity) || 1);
  if (qty > orderItem.quantity) throw new ApiError(400, "Return quantity exceeds ordered quantity");

  const deliveredAt =
    [...(order.statusHistory || [])].reverse().find((h) => h.status === "delivered")?.at || order.updatedAt;
  const product = await Product.findById(productId).select("returnWindowDays");
  const windowDays = product?.returnWindowDays != null ? Number(product.returnWindowDays) : 7;
  if (windowDays <= 0) throw new ApiError(400, "This product is not eligible for return");
  const daysSince = (Date.now() - new Date(deliveredAt).getTime()) / (24 * 60 * 60 * 1000);
  if (daysSince > windowDays) {
    throw new ApiError(400, `Return window of ${windowDays} days has expired`);
  }

  const openReturn = await Return.findOne({
    order: orderId,
    product: productId,
    user: req.user!._id,
    status: { $nin: ["rejected"] },
  });
  if (openReturn) throw new ApiError(400, "A return for this item is already in progress");

  const returnRequest = await Return.create({
    order: orderId,
    user: req.user!._id,
    product: productId,
    quantity: qty,
    reason,
    resolution: resolutionNorm,
    refundAmount: resolutionNorm === "refund" ? orderItem.price * qty : undefined,
  });

  await notifyUser(
    req.user!._id.toString(),
    "order_update",
    "Return requested",
    `Your return request for ${orderItem.name} was submitted.`,
    returnRequest._id.toString()
  );

  res.status(201).json({ success: true, data: returnRequest });
});

export const listMyReturns = asyncHandler(async (req: Request, res: Response) => {
  const returns = await Return.find({ user: req.user!._id })
    .populate("product", "name images")
    .populate("order", "totalAmount createdAt")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: returns });
});

export const getReturn = asyncHandler(async (req: Request, res: Response) => {
  const returnRequest = await Return.findById(req.params.id)
    .populate("product", "name images")
    .populate("order", "totalAmount createdAt shippingAddress");
  if (!returnRequest) throw new ApiError(404, "Return request not found");

  const isOwner = returnRequest.user.toString() === req.user!._id.toString();
  if (!isOwner && req.user!.role === "customer") throw new ApiError(403, "Not authorized");

  res.json({ success: true, data: returnRequest });
});

export const adminListReturns = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status && status !== "All") filter.status = status;

  const returns = await Return.find(filter)
    .populate("user", "name email phone")
    .populate("product", "name images")
    .populate("order", "totalAmount paymentStatus paymentMethod")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: returns });
});

export const updateReturnStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status, refundMethod, pickupDate, inspectionNotes } = req.body;
  const validStatuses = ["requested", "approved", "rejected", "picked_up", "inspected", "refunded"];
  if (!validStatuses.includes(status)) throw new ApiError(400, `status must be one of: ${validStatuses.join(", ")}`);

  const existing = await Return.findById(req.params.id);
  if (!existing) throw new ApiError(404, "Return request not found");

  if (status === "refunded") {
    if (!["picked_up", "inspected", "approved"].includes(existing.status) && !existing.shiprocket?.receivedAt) {
      throw new ApiError(400, "Refund is only available after the return is picked up / received");
    }
  }
  if (status === "picked_up" && !["approved", "picked_up"].includes(existing.status)) {
    throw new ApiError(400, "Pickup can only be marked after approval");
  }
  if (status === "approved" && existing.status !== "requested") {
    throw new ApiError(400, "Only requested returns can be approved");
  }

  // Approve → create Shiprocket reverse pickup
  if (status === "approved") {
    existing.status = "approved";
    if (inspectionNotes !== undefined) existing.inspectionNotes = inspectionNotes;
    await existing.save();

    let shipError: string | undefined;
    try {
      await pushReturnToShiprocket(existing);
    } catch (err) {
      shipError = (err as Error)?.message || "Shiprocket return create failed";
      existing.inspectionNotes = [existing.inspectionNotes, `Shiprocket: ${shipError}`].filter(Boolean).join(" · ");
      await existing.save();
    }

    await logAudit(req, "returns", "status:approved", existing._id.toString());
    const awb = existing.shiprocket?.awb;
    const track = existing.shiprocket?.trackingUrl;
    await notifyUser(
      existing.user.toString(),
      "order_update",
      "Return approved",
      awb
        ? `Your return was approved. Pickup AWB ${awb}${track ? ` — track: ${track}` : ""}.`
        : shipError
          ? `Your return was approved. Pickup will be arranged shortly (${shipError}).`
          : "Your return was approved. A reverse pickup has been scheduled.",
      existing._id.toString()
    );

    return res.json({
      success: true,
      data: existing,
      shiprocket: existing.shiprocket || null,
      warning: shipError,
    });
  }

  // Manual "mark refunded" — also run gateway refund if not already done
  if (status === "refunded") {
    const result = await finalizeReturnReceived(existing, "Admin marked return refunded");
    await logAudit(req, "returns", "status:refunded", existing._id.toString());
    return res.json({ success: true, data: result.returnRequest, refund: result.refund });
  }

  const patch: Record<string, unknown> = { status };
  if (refundMethod !== undefined) patch.refundMethod = refundMethod;
  if (pickupDate !== undefined) patch.pickupDate = pickupDate;
  if (inspectionNotes !== undefined) patch.inspectionNotes = inspectionNotes;
  if (status === "picked_up" && !existing.pickupDate && pickupDate === undefined) {
    patch.pickupDate = new Date();
  }

  const returnRequest = await Return.findByIdAndUpdate(req.params.id, patch, { new: true });
  if (!returnRequest) throw new ApiError(404, "Return request not found");

  await logAudit(req, "returns", `status:${status}`, returnRequest._id.toString());
  await notifyUser(
    returnRequest.user.toString(),
    "order_update",
    "Return status updated",
    `Your return request is now ${String(status).replace(/_/g, " ")}.`,
    returnRequest._id.toString()
  );

  res.json({ success: true, data: returnRequest });
});

/** Admin: sync Shiprocket return tracking; auto-refund when delivered to warehouse. */
export const syncReturnShiprocket = asyncHandler(async (req: Request, res: Response) => {
  const ret = await Return.findById(req.params.id);
  if (!ret) throw new ApiError(404, "Return request not found");
  if (!ret.shiprocket?.orderId) throw new ApiError(400, "Return is not on Shiprocket yet — approve it first");

  const synced = await syncShiprocketReturnOrder(ret.shiprocket.orderId);
  const result = await applyShiprocketReturnUpdate(ret, synced);
  await logAudit(req, "returns", "shiprocket:sync", ret._id.toString());
  res.json({ success: true, data: result.returnRequest, refund: result.refund, shiprocket: synced });
});

/** Shiprocket tracking webhook — matches return by AWB / SR order id. */
export const shiprocketReturnWebhook = asyncHandler(async (req: Request, res: Response) => {
  const secret = process.env.SHIPROCKET_WEBHOOK_SECRET;
  if (secret) {
    const header =
      req.header("x-api-key") ||
      req.header("x-shiprocket-secret") ||
      (req.query.secret as string | undefined);
    if (header !== secret) throw new ApiError(401, "Invalid Shiprocket webhook secret");
  }

  const body = req.body || {};
  const awb = String(body.awb || body.awb_code || body.Awb || "").trim();
  const srOrderId = String(body.sr_order_id || body.order_id || body.SROrderID || "").trim();
  const status = String(
    body.current_status || body.current_status_code || body.status || body.shipment_status || ""
  ).trim();

  if (!awb && !srOrderId) {
    return res.json({ success: true, ignored: true, reason: "no_awb_or_order_id" });
  }

  const filter: Record<string, unknown>[] = [];
  if (awb) filter.push({ "shiprocket.awb": awb });
  if (srOrderId) {
    filter.push({ "shiprocket.orderId": srOrderId });
    // Channel order ids we create look like RETxxxxxxxx
    filter.push({ "shiprocket.orderId": String(srOrderId) });
  }

  const ret = await Return.findOne({ $or: filter, status: { $nin: ["rejected", "refunded"] } });
  if (!ret) {
    return res.json({ success: true, ignored: true, reason: "return_not_found" });
  }

  const result = await applyShiprocketReturnUpdate(ret, {
    awb: awb || ret.shiprocket?.awb,
    status: status || ret.shiprocket?.status,
    courier: body.courier_name || body.courier || ret.shiprocket?.courier,
    trackingUrl: awb ? `https://shiprocket.co/tracking/${awb}` : ret.shiprocket?.trackingUrl,
  });

  res.json({ success: true, data: { returnId: ret._id, status: result.returnRequest.status }, refund: result.refund });
});
