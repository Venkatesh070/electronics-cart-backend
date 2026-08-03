import { Schema, model, Document, Types } from "mongoose";

export type CampaignChannel = "email" | "sms";
export type CampaignStatus = "draft" | "scheduled" | "sent";

export interface ICampaign extends Document {
  _id: Types.ObjectId;
  name: string;
  channel: CampaignChannel;
  segment: { minOrders?: number; minSpend?: number; role?: string };
  subject?: string;
  message: string;
  scheduledAt?: Date;
  status: CampaignStatus;
  stats: { sent: number; opened: number; clicked: number };
}

const campaignSchema = new Schema<ICampaign>(
  {
    name: { type: String, required: true },
    channel: { type: String, enum: ["email", "sms"], required: true },
    segment: {
      minOrders: { type: Number },
      minSpend: { type: Number },
      role: { type: String },
    },
    subject: { type: String },
    message: { type: String, required: true },
    scheduledAt: { type: Date },
    status: { type: String, enum: ["draft", "scheduled", "sent"], default: "draft" },
    stats: {
      sent: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const Campaign = model<ICampaign>("Campaign", campaignSchema);
