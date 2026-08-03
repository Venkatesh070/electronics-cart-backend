import { Request, Response } from "express";
import { Return } from "../models/Return";
import { Order } from "../models/Order";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { logAudit } from "../utils/auditLog";
import { notifyUser } from "../utils/notify";

export const createReturn = asyncHandler(async (req: Request, res: Response) => {
  const { orderId, productId, quantity = 1, reason, resolution } = req.body;
  if (!orderId || !productId || !reason || !resolution) {
    throw new ApiError(400, "orderId, productId, reason and resolution are required");
  }

  const order = await Order.findOne({ _id: orderId, user: req.user!._id });
  if (!order) throw new ApiError(404, "Order not found");
  if (order.status !== "delivered") throw new ApiError(400, "Only delivered orders can be returned");

  const orderItem = order.items.find((i) => i.product.toString() === productId);
  if (!orderItem) throw new ApiError(400, "Product not found in this order");

  const returnRequest = await Return.create({
    order: orderId,
    user: req.user!._id,
    product: productId,
    quantity,
    reason,
    resolution,
    refundAmount: resolution === "refund" ? orderItem.price * quantity : undefined,
  });

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

  const returnRequest = await Return.findByIdAndUpdate(
    req.params.id,
    { status, refundMethod, pickupDate, inspectionNotes },
    { new: true }
  );
  if (!returnRequest) throw new ApiError(404, "Return request not found");

  await logAudit(req, "returns", `status:${status}`, returnRequest._id.toString());
  await notifyUser(
    returnRequest.user.toString(),
    "order_update",
    "Return status updated",
    `Your return request is now ${status}.`,
    returnRequest._id.toString()
  );

  res.json({ success: true, data: returnRequest });
});
