import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { STAFF_ROLES } from "../models/User";
import { User } from "../models/User";
import { IAdminRole } from "../models/AdminRole";
import { ApiError } from "../utils/ApiError";

interface JwtPayload {
  id: string;
}

export async function protect(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new ApiError(401, "Not authorized, no token provided");
    }

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;

    const user = await User.findById(decoded.id).populate("adminRole");
    if (!user) {
      throw new ApiError(401, "Not authorized, user no longer exists");
    }
    if (user.isBlocked) {
      throw new ApiError(403, "This account has been blocked");
    }

    req.user = user;
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, "Not authorized, token invalid or expired"));
  }
}

/** Like `protect`, but proceeds without a user instead of rejecting when no valid token is present. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) return next();

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    const user = await User.findById(decoded.id);
    if (user && !user.isBlocked) req.user = user;
    next();
  } catch {
    next();
  }
}

/** Gate for any staff account (support/manager/admin/superadmin). */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || !STAFF_ROLES.includes(req.user.role)) {
    return next(new ApiError(403, "Admin access required"));
  }
  next();
}

/**
 * Fine-grained gate for a specific admin module + action, backed by the
 * user's AdminRole permission matrix. Superadmins always pass. Staff
 * without an assigned AdminRole (or without the permission) are denied.
 */
export function requirePermission(module: string, action: "view" | "edit" | "delete") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user || !STAFF_ROLES.includes(user.role)) {
      return next(new ApiError(403, "Admin access required"));
    }
    if (user.role === "superadmin") return next();

    const adminRole = user.adminRole as unknown as IAdminRole | undefined;
    const permission = adminRole?.permissions?.find((p) => p.module === module);
    if (!permission || !permission[action]) {
      return next(new ApiError(403, `Missing '${action}' permission on '${module}'`));
    }
    next();
  };
}
