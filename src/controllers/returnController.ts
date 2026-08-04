import { Request, Response } from "express";
import { Return } from "../models/Return";
import { Order } from "../models/Order";
import { Product } from "../models/Product";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { logAudit } from "../utils/auditLog";
import { notifyUser } from "../utils/notify";

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
  // ponytail: default 7-day window when product has no returnWindowDays
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
    .populate("order", "totalAmount createdAt");
  if (!returnRequest) throw new ApiError(404, "Return request not found");

  const isOwner = returnRequest.user.toString() === req.user!._id.toString();
  if (!isOwner && req.user!.role === "customer") throw new ApiError(403, "Not authorized");

  res.json({ success: true, data: returnRequest });
});

// --- Admin queue ---

export const adminListReturns = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;

  const returns = await Return.find(filter)
    .populate("user", "name email")
    .populate("product", "name images")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: returns });
});

export const updateReturnStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status, refundMethod, pickupDate, inspectionNotes } = req.body;
  const validStatuses = ["requested", "approved", "rejected", "picked_up", "inspected", "refunded"];
  if (!validStatuses.includes(status)) throw new ApiError(400, `status must be one of: ${validStatuses.join(", ")}`);

  const existing = await Return.findById(req.params.id);
  if (!existing) throw new ApiError(404, "Return request not found");

  // Refund / complete only after pickup (inspected kept for legacy rows)
  if (status === "refunded") {
    if (!["picked_up", "inspected"].includes(existing.status)) {
      throw new ApiError(400, "Refund is only available after the item is picked up");
    }
  }
  if (status === "picked_up" && existing.status !== "approved") {
    throw new ApiError(400, "Pickup can only be marked after approval");
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
    status === "refunded"
      ? returnRequest.resolution === "replacement"
        ? "Your replacement has been processed."
        : "Your refund has been processed after pickup."
      : `Your return request is now ${String(status).replace(/_/g, " ")}.`,
    returnRequest._id.toString()
  );

  res.json({ success: true, data: returnRequest });
});
