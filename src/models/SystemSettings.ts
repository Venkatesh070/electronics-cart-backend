import { Schema, model, Document, Types } from "mongoose";

export interface ISystemSettingsSocial {
  facebook?: string;
  instagram?: string;
  x?: string;
  youtube?: string;
  linkedin?: string;
}

export interface ISystemSettings extends Document {
  _id: Types.ObjectId;
  storeName: string;
  logo?: string;
  tagline?: string;
  location?: string;
  supportPhone?: string;
  whatsapp?: string;
  /** Accent color for the second word of the wordmark (e.g. "CART"), hex. */
  brandAccentColor: string;
  social: ISystemSettingsSocial;
  currency: string;
  locale: string;
  timezone: string;
  maintenanceMode: boolean;
  /** Seller GSTIN for Shiprocket / tax invoices (orders over ₹50k). */
  sellerGstin?: string;
}

const socialSchema = new Schema<ISystemSettingsSocial>(
  {
    facebook: { type: String, trim: true },
    instagram: { type: String, trim: true },
    x: { type: String, trim: true },
    youtube: { type: String, trim: true },
    linkedin: { type: String, trim: true },
  },
  { _id: false }
);

const systemSettingsSchema = new Schema<ISystemSettings>(
  {
    storeName: { type: String, default: "Electronics Cart" },
    logo: { type: String },
    tagline: { type: String, trim: true },
    location: { type: String, trim: true },
    supportPhone: { type: String, trim: true },
    whatsapp: { type: String, trim: true },
    brandAccentColor: { type: String, trim: true, default: "#FF6B1A" },
    social: { type: socialSchema, default: () => ({}) },
    currency: { type: String, default: "INR" },
    locale: { type: String, default: "en-IN" },
    timezone: { type: String, default: "Asia/Kolkata" },
    maintenanceMode: { type: Boolean, default: false },
    sellerGstin: { type: String, trim: true },
  },
  { timestamps: true }
);

export const SystemSettings = model<ISystemSettings>("SystemSettings", systemSettingsSchema);
