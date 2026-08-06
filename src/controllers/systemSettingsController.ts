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
      tagline: settings.tagline || "",
      location: settings.location || "",
      supportPhone: settings.supportPhone || "",
      whatsapp: settings.whatsapp || "",
      brandAccentColor: settings.brandAccentColor,
      social: settings.social || {},
      currency: settings.currency,
      maintenanceMode: settings.maintenanceMode,
    },
  });
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await getOrCreateSettings();
  const {
    storeName,
    logo,
    tagline,
    location,
    supportPhone,
    whatsapp,
    brandAccentColor,
    social,
    currency,
    locale,
    timezone,
    maintenanceMode,
    sellerGstin
  } = req.body;
  if (storeName !== undefined) settings.storeName = storeName;
  if (logo !== undefined) settings.logo = logo;
  if (tagline !== undefined) settings.tagline = tagline;
  if (location !== undefined) settings.location = location;
  if (supportPhone !== undefined) settings.supportPhone = supportPhone;
  if (whatsapp !== undefined) settings.whatsapp = whatsapp;
  if (brandAccentColor !== undefined) settings.brandAccentColor = brandAccentColor;
  if (social !== undefined) {
    settings.social = {
      facebook: social.facebook || undefined,
      instagram: social.instagram || undefined,
      x: social.x || undefined,
      youtube: social.youtube || undefined,
      linkedin: social.linkedin || undefined,
    };
  }
  if (currency !== undefined) settings.currency = currency;
  if (locale !== undefined) settings.locale = locale;
  if (timezone !== undefined) settings.timezone = timezone;
  if (maintenanceMode !== undefined) settings.maintenanceMode = maintenanceMode;
  if (sellerGstin !== undefined) settings.sellerGstin = String(sellerGstin || "").trim().toUpperCase();
  await settings.save();
  res.json({ success: true, data: settings });
});
