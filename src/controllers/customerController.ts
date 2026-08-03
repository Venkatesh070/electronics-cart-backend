import { Request, Response } from "express";
import { User } from "../models/User";
import { Order } from "../models/Order";
import { Address } from "../models/Address";
import { Ticket } from "../models/Ticket";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { logAudit } from "../utils/auditLog";

export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
  const { search, page = "1", limit = "20" } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { role: "customer" };
  if (search) {
    filter.$or = [{ name: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const customers = await User.find(filter)
    .select("name email phone isBlocked createdAt")
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .sort({ createdAt: -1 });

  const spendStats = await Order.aggregate([
    { $match: { user: { $in: customers.map((c) => c._id) }, status: { $ne: "cancelled" } } },
    { $group: { _id: "$user", orderCount: { $sum: 1 }, totalSpend: { $sum: "$totalAmount" } } },
  ]);
  const statsMap = new Map(spendStats.map((s) => [s._id.toString(), s]));

  const total = await User.countDocuments(filter);

  res.json({
    success: true,
    data: customers.map((c) => ({
      ...c.toObject(),
      orderCount: statsMap.get(c._id.toString())?.orderCount || 0,
      totalSpend: statsMap.get(c._id.toString())?.totalSpend || 0,
    })),
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

export const getCustomerProfile = asyncHandler(async (req: Request, res: Response) => {
  const customer = await User.findById(req.params.id).select("-password").populate("adminNotes.author", "name");
  if (!customer) throw new ApiError(404, "Customer not found");

  const [orders, addresses, tickets] = await Promise.all([
    Order.find({ user: customer._id }).sort({ createdAt: -1 }),
    Address.find({ user: customer._id }),
    Ticket.find({ user: customer._id }).sort({ updatedAt: -1 }),
  ]);

  res.json({ success: true, data: { customer, orders, addresses, tickets } });
});

export const setBlockedStatus = asyncHandler(async (req: Request, res: Response) => {
  const { isBlocked } = req.body as { isBlocked: boolean };
  const customer = await User.findByIdAndUpdate(req.params.id, { isBlocked }, { new: true }).select("-password");
  if (!customer) throw new ApiError(404, "Customer not found");

  await logAudit(req, "customers", isBlocked ? "block" : "unblock", customer._id.toString());
  res.json({ success: true, data: customer });
});

export const addCustomerNote = asyncHandler(async (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) throw new ApiError(400, "text is required");

  const customer = await User.findByIdAndUpdate(
    req.params.id,
    { $push: { adminNotes: { author: req.user!._id, text, at: new Date() } } },
    { new: true }
  ).select("-password");
  if (!customer) throw new ApiError(404, "Customer not found");

  res.json({ success: true, data: customer.adminNotes });
});
