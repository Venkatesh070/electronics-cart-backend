import { Request } from "express";
import { AuditLog } from "../models/AuditLog";

/** Fire-and-forget audit trail entry for a key admin mutation. Never throws. */
export async function logAudit(req: Request, module: string, action: string, targetId?: string) {
  try {
    await AuditLog.create({
      user: req.user?._id,
      userName: req.user?.name,
      module,
      action,
      targetId,
    });
  } catch {
    // Auditing must never break the primary request.
  }
}
