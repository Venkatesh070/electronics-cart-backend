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

/** Public branding + maintenance flag for storefront / login screens. */
export const getPublicSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await getOrCreateSettings();
  res.json({
    success: true,
    data: {
      storeName: settings.storeName,
      logo: settings.logo || "",
      currency: settings.currency,
      maintenanceMode: settings.maintenanceMode,
    },
  });
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await getOrCreateSettings();
  const { storeName, logo, currency, locale, timezone, maintenanceMode } = req.body;
  if (storeName !== undefined) settings.storeName = storeName;
  if (logo !== undefined) settings.logo = logo;
  if (currency !== undefined) settings.currency = currency;
  if (locale !== undefined) settings.locale = locale;
  if (timezone !== undefined) settings.timezone = timezone;
  if (maintenanceMode !== undefined) settings.maintenanceMode = maintenanceMode;
  await settings.save();
  res.json({ success: true, data: settings });
});
