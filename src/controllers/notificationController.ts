import { Request, Response } from "express";
import { Notification } from "../models/Notification";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const notifications = await Notification.find({ user: req.user!._id }).sort({ createdAt: -1 });
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  res.json({ success: true, data: notifications, unreadCount });
});

export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user!._id },
    { isRead: true },
    { new: true }
  );
  if (!notification) throw new ApiError(404, "Notification not found");
  res.json({ success: true, data: notification });
});

export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  await Notification.updateMany({ user: req.user!._id, isRead: false }, { isRead: true });
  res.json({ success: true, data: {} });
});
