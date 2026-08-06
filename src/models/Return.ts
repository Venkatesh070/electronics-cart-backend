import { Schema, model, Document, Types } from "mongoose";

export type ReturnResolution = "refund" | "replacement";
export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "picked_up"
  | "inspected"
  | "refunded";

export interface IReturnShiprocket {
  orderId?: string;
  shipmentId?: string;
  awb?: string;
  courier?: string;
  status?: string;
  trackingUrl?: string;
  pushedAt?: Date;
  receivedAt?: Date;
}

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
  shiprocket?: IReturnShiprocket;
  razorpayRefundId?: string;
  refundedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const shiprocketSchema = new Schema<IReturnShiprocket>(
  {
    orderId: { type: String },
    shipmentId: { type: String },
    awb: { type: String },
    courier: { type: String },
    status: { type: String },
    trackingUrl: { type: String },
    pushedAt: { type: Date },
    receivedAt: { type: Date },
  },
  { _id: false }
);

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
    shiprocket: { type: shiprocketSchema },
    razorpayRefundId: { type: String },
    refundedAt: { type: Date },
  },
  { timestamps: true }
);

returnSchema.index({ "shiprocket.orderId": 1 });
returnSchema.index({ "shiprocket.awb": 1 });

export const Return = model<IReturn>("Return", returnSchema);
