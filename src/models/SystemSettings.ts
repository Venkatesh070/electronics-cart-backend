import { Schema, model, Document, Types } from "mongoose";

export interface ISystemSettings extends Document {
  _id: Types.ObjectId;
  storeName: string;
  logo?: string;
  currency: string;
  locale: string;
  timezone: string;
  maintenanceMode: boolean;
  /** Seller GSTIN for Shiprocket / tax invoices (orders over ₹50k). */
  sellerGstin?: string;
}

const systemSettingsSchema = new Schema<ISystemSettings>(
  {
    storeName: { type: String, default: "Electronics Cart" },
    logo: { type: String },
    currency: { type: String, default: "INR" },
    locale: { type: String, default: "en-IN" },
    timezone: { type: String, default: "Asia/Kolkata" },
    maintenanceMode: { type: Boolean, default: false },
    sellerGstin: { type: String, trim: true },
  },
  { timestamps: true }
);

export const SystemSettings = model<ISystemSettings>("SystemSettings", systemSettingsSchema);
