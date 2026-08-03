import { Request, Response } from "express";
import { Campaign } from "../models/Campaign";
import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const listCampaigns = asyncHandler(async (_req: Request, res: Response) => {
  const campaigns = await Campaign.find().sort({ createdAt: -1 });
  res.json({ success: true, data: campaigns });
});

export const createCampaign = asyncHandler(async (req: Request, res: Response) => {
  const { name, channel, message } = req.body;
  if (!name || !channel || !message) throw new ApiError(400, "name, channel and message are required");

  const campaign = await Campaign.create(req.body);
  res.status(201).json({ success: true, data: campaign });
});

export const updateCampaign = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await Campaign.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!campaign) throw new ApiError(404, "Campaign not found");
  res.json({ success: true, data: campaign });
});

export const deleteCampaign = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await Campaign.findByIdAndDelete(req.params.id);
  if (!campaign) throw new ApiError(404, "Campaign not found");
  res.json({ success: true, data: {} });
});

/**
 * Stubbed "send": resolves the audience size from the segment criteria and marks the
 * campaign sent. Wire a real email/SMS provider call in here when one is available.
 */
export const sendCampaign = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await Campaign.findById(req.params.id);
  if (!campaign) throw new ApiError(404, "Campaign not found");

  const filter: Record<string, unknown> = {};
  if (campaign.segment?.role) filter.role = campaign.segment.role;

  const audienceSize = await User.countDocuments(filter);

  campaign.status = "sent";
  campaign.stats = { sent: audienceSize, opened: 0, clicked: 0 };
  await campaign.save();

  res.json({ success: true, data: campaign });
});
