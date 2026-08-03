import { Request, Response } from "express";
import { AuditLog } from "../models/AuditLog";
import { asyncHandler } from "../utils/asyncHandler";

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { user, module, action, page = "1", limit = "50" } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (user) filter.user = user;
  if (module) filter.module = module;
  if (action) filter.action = { $regex: action, $options: "i" };

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    AuditLog.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});
