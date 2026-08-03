import { Request, Response } from "express";
import crypto from "crypto";
import { Webhook } from "../models/Webhook";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const listWebhooks = asyncHandler(async (_req: Request, res: Response) => {
  const webhooks = await Webhook.find().select("-secret").sort({ createdAt: -1 });
  res.json({ success: true, data: webhooks });
});

export const createWebhook = asyncHandler(async (req: Request, res: Response) => {
  const { url, events } = req.body;
  if (!url || !events || !Array.isArray(events) || events.length === 0) {
    throw new ApiError(400, "url and a non-empty events array are required");
  }

  const webhook = await Webhook.create({
    url,
    events,
    secret: crypto.randomBytes(16).toString("hex"),
  });
  res.status(201).json({ success: true, data: webhook });
});

export const updateWebhook = asyncHandler(async (req: Request, res: Response) => {
  const webhook = await Webhook.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  }).select("-secret");
  if (!webhook) throw new ApiError(404, "Webhook not found");
  res.json({ success: true, data: webhook });
});

export const deleteWebhook = asyncHandler(async (req: Request, res: Response) => {
  const webhook = await Webhook.findByIdAndDelete(req.params.id);
  if (!webhook) throw new ApiError(404, "Webhook not found");
  res.json({ success: true, data: {} });
});
