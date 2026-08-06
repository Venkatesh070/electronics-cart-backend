import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { UPLOAD_ROOT } from "../middleware/upload";

// Best-effort cleanup of a previously-uploaded avatar file so replacing/removing
// a picture doesn't leave orphaned files behind in uploads/avatars.
function removeAvatarFile(avatarUrl?: string | null) {
  if (!avatarUrl || !avatarUrl.startsWith("/uploads/avatars/")) return;
  const filePath = path.join(UPLOAD_ROOT, avatarUrl.replace("/uploads/", ""));
  fs.unlink(filePath, () => {});
}

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, dob } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user!._id,
    { $set: { name, phone, dob } },
    { new: true, runValidators: true }
  );
  if (!user) throw new ApiError(404, "User not found");
  res.json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      dob: user.dob,
      avatar: user.avatar,
      createdAt: user.createdAt,
      verified: Boolean(user.email || user.phone),
      authProviders: user.authProviders || [],
      notificationPreferences: user.notificationPreferences,
    },
  });
});

export const uploadAvatar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No image file uploaded");

  const user = await User.findById(req.user!._id);
  if (!user) throw new ApiError(404, "User not found");

  const previousAvatar = user.avatar;
  user.avatar = `/uploads/avatars/${req.file.filename}`;
  await user.save();
  removeAvatarFile(previousAvatar);

  res.json({ success: true, data: { avatar: user.avatar } });
});

export const removeAvatar = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!._id);
  if (!user) throw new ApiError(404, "User not found");

  removeAvatarFile(user.avatar);
  user.avatar = undefined;
  await user.save();

  res.json({ success: true, data: { avatar: null } });
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
