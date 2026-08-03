import { Request, Response } from "express";
import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, dob } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user!._id,
    { $set: { name, phone, dob } },
    { new: true, runValidators: true }
  );
  res.json({
    success: true,
    data: { id: user!._id, name: user!.name, email: user!.email, phone: user!.phone, dob: user!.dob },
  });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "currentPassword and newPassword are required");
  }

  const user = await User.findById(req.user!._id).select("+password");
  if (!user || !(await user.comparePassword(currentPassword))) {
    throw new ApiError(401, "Current password is incorrect");
  }

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: "Password updated" });
});

export const updateNotificationPreferences = asyncHandler(async (req: Request, res: Response) => {
  const { orderUpdates, priceDrops, promotions, supportReplies } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user!._id,
    {
      $set: {
        "notificationPreferences.orderUpdates": orderUpdates,
        "notificationPreferences.priceDrops": priceDrops,
        "notificationPreferences.promotions": promotions,
        "notificationPreferences.supportReplies": supportReplies,
      },
    },
    { new: true, runValidators: true }
  );
  res.json({ success: true, data: user!.notificationPreferences });
});
