import { Request, Response } from "express";
import { NewsletterSubscriber } from "../models/Newsletter";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const { email, source } = req.body;
  if (!email) throw new ApiError(400, "email is required");

  const subscriber = await NewsletterSubscriber.findOneAndUpdate(
    { email: email.toLowerCase() },
    { active: true, source: source || "website" },
    { new: true, upsert: true, runValidators: true }
  );

  res.status(201).json({ success: true, data: { email: subscriber.email, active: subscriber.active } });
});

export const unsubscribe = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, "email is required");

  const subscriber = await NewsletterSubscriber.findOneAndUpdate(
    { email: email.toLowerCase() },
    { active: false },
    { new: true }
  );
  if (!subscriber) throw new ApiError(404, "Subscriber not found");

  res.json({ success: true, data: { email: subscriber.email, active: subscriber.active } });
});

export const listSubscribers = asyncHandler(async (req: Request, res: Response) => {
  const { active, page = "1", limit = "50" } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (active === "true") filter.active = true;
  if (active === "false") filter.active = false;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  const [subscribers, total] = await Promise.all([
    NewsletterSubscriber.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    NewsletterSubscriber.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: subscribers,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});
