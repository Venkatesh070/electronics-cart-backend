import { Schema, model, Document, Types } from "mongoose";

export type ReturnResolution = "refund" | "replacement";
export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "picked_up"
  | "inspected"
  | "refunded";

export interface IReturn extends Document {
  _id: Types.ObjectId;
  order: Types.ObjectId;
  user: Types.ObjectId;
  product: Types.ObjectId;
  quantity: number;
  reason: string;
  resolution: ReturnResolution;
  status: ReturnStatus;
  refundAmount?: number;
  refundMethod?: string;
  pickupDate?: Date;
  inspectionNotes?: string;
}

const returnSchema = new Schema<IReturn>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    reason: { type: String, required: true },
    resolution: { type: String, enum: ["refund", "replacement"], required: true },
    status: {
      type: String,
      enum: ["requested", "approved", "rejected", "picked_up", "inspected", "refunded"],
      default: "requested",
    },
    refundAmount: { type: Number },
    refundMethod: { type: String },
    pickupDate: { type: Date },
    inspectionNotes: { type: String },
  },
  { timestamps: true }
);

export const Return = model<IReturn>("Return", returnSchema);
