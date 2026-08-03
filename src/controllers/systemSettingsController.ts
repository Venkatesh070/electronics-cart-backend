import { Request, Response } from "express";
import { SystemSettings } from "../models/SystemSettings";
import { asyncHandler } from "../utils/asyncHandler";

async function getOrCreateSettings() {
  let settings = await SystemSettings.findOne();
  if (!settings) settings = await SystemSettings.create({});
  return settings;
}

export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await getOrCreateSettings();
  res.json({ success: true, data: settings });
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await getOrCreateSettings();
  Object.assign(settings, req.body);
  await settings.save();
  res.json({ success: true, data: settings });
});
