import { Request, Response } from "express";
import { Campaign } from "../models/Campaign";
import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

function buildPayload(body: Record<string, unknown>, { requireName = false } = {}) {
  const name = body.name as string | undefined;
  if (requireName && !String(name || "").trim()) {
    throw new ApiError(400, "name is required");
  }

  const payload: Record<string, unknown> = {};
  const keys = [
    "name",
    "campaignType",
    "objective",
    "shortDescription",
    "tags",
    "channel",
    "channels",
    "segment",
    "subject",
    "message",
    "contentHtml",
    "startsAt",
    "endsAt",
    "timezone",
    "totalBudget",
    "dailyBudget",
    "maxDiscount",
    "scheduledAt",
    "status",
  ] as const;

  for (const key of keys) {
    if (body[key] !== undefined) payload[key] = body[key];
  }

  if (Array.isArray(payload.channels) && payload.channels.length && !payload.channel) {
    payload.channel = (payload.channels as string[])[0];
  }

  if (!payload.message) {
    payload.message =
      String(payload.shortDescription || payload.subject || payload.name || "Campaign").trim();
  }

  for (const key of ["totalBudget", "dailyBudget", "maxDiscount"] as const) {
    if (payload[key] === "" || payload[key] == null) delete payload[key];
    else if (payload[key] !== undefined) payload[key] = Number(payload[key]) || 0;
  }

  return payload;
}

export const listCampaigns = asyncHandler(async (_req: Request, res: Response) => {
  const campaigns = await Campaign.find().sort({ createdAt: -1 });
  res.json({ success: true, data: campaigns });
});

export const getCampaignById = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await Campaign.findById(req.params.id);
  if (!campaign) throw new ApiError(404, "Campaign not found");
  res.json({ success: true, data: campaign });
});

export const createCampaign = asyncHandler(async (req: Request, res: Response) => {
  const payload = buildPayload(req.body, { requireName: true });
  if (!payload.status) payload.status = "draft";
  const campaign = await Campaign.create(payload);
  res.status(201).json({ success: true, data: campaign });
});

export const updateCampaign = asyncHandler(async (req: Request, res: Response) => {
  const payload = buildPayload(req.body);
  const campaign = await Campaign.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true,
  });
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
