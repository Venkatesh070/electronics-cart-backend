import { Request, Response } from "express";
import { User, STAFF_ROLES } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const listStaff = asyncHandler(async (_req: Request, res: Response) => {
  const staff = await User.find({ role: { $in: STAFF_ROLES } }).populate("adminRole", "name");
  res.json({ success: true, data: staff });
});

export const createStaff = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, role, adminRole } = req.body;
  if (!name || !email || !password || !role) {
    throw new ApiError(400, "name, email, password and role are required");
  }
  if (!STAFF_ROLES.includes(role)) throw new ApiError(400, `role must be one of: ${STAFF_ROLES.join(", ")}`);

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new ApiError(409, "An account with this email already exists");

  const staff = await User.create({ name, email, password, role, adminRole });
  res.status(201).json({
    success: true,
    data: { id: staff._id, name: staff.name, email: staff.email, role: staff.role, adminRole: staff.adminRole },
  });
});

export const assignRole = asyncHandler(async (req: Request, res: Response) => {
  const { role, adminRole } = req.body;

  const staff = await User.findById(req.params.id);
  if (!staff) throw new ApiError(404, "Staff account not found");
  if (!STAFF_ROLES.includes(staff.role)) throw new ApiError(400, "This account is not a staff account");

  if (role) {
    if (!STAFF_ROLES.includes(role)) throw new ApiError(400, `role must be one of: ${STAFF_ROLES.join(", ")}`);
    staff.role = role;
  }
  if (adminRole !== undefined) staff.adminRole = adminRole;
  await staff.save();

  res.json({ success: true, data: { id: staff._id, role: staff.role, adminRole: staff.adminRole } });
});
