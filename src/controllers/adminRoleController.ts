import { Request, Response } from "express";
import { AdminRole } from "../models/AdminRole";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const listRoles = asyncHandler(async (_req: Request, res: Response) => {
  const roles = await AdminRole.find().sort({ name: 1 });
  res.json({ success: true, data: roles });
});

export const createRole = asyncHandler(async (req: Request, res: Response) => {
  const { name, permissions } = req.body;
  if (!name) throw new ApiError(400, "name is required");

  const role = await AdminRole.create({ name, permissions });
  res.status(201).json({ success: true, data: role });
});

export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const role = await AdminRole.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!role) throw new ApiError(404, "Role not found");
  res.json({ success: true, data: role });
});

export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  const role = await AdminRole.findByIdAndDelete(req.params.id);
  if (!role) throw new ApiError(404, "Role not found");
  res.json({ success: true, data: {} });
});
