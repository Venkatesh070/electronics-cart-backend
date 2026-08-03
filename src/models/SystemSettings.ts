import { Schema, model, Document, Types } from "mongoose";

export interface ISystemSettings extends Document {
  _id: Types.ObjectId;
  storeName: string;
  currency: string;
  locale: string;
  timezone: string;
  maintenanceMode: boolean;
}

const systemSettingsSchema = new Schema<ISystemSettings>(
  {
    storeName: { type: String, default: "Electronics Cart" },
    currency: { type: String, default: "INR" },
    locale: { type: String, default: "en-IN" },
    timezone: { type: String, default: "Asia/Kolkata" },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const SystemSettings = model<ISystemSettings>("SystemSettings", systemSettingsSchema);
