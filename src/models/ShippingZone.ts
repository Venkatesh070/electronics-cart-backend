import { Schema, model, Document, Types } from "mongoose";

export interface IShippingZone extends Document {
  _id: Types.ObjectId;
  name: string;
  regions: string[];
  baseRate: number;
  freeShippingThreshold?: number;
  courierPartner?: string;
  active: boolean;
}

const shippingZoneSchema = new Schema<IShippingZone>(
  {
    name: { type: String, required: true, trim: true },
    regions: { type: [String], required: true },
    baseRate: { type: Number, required: true, min: 0 },
    freeShippingThreshold: { type: Number },
    courierPartner: { type: String },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const ShippingZone = model<IShippingZone>("ShippingZone", shippingZoneSchema);
