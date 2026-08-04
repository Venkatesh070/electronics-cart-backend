import { Schema, model, Document, Types } from "mongoose";

export type CampaignChannel = "email" | "sms" | "push" | "multi";
export type CampaignStatus = "draft" | "scheduled" | "sent" | "active" | "ended";
export type CampaignType = "promotional" | "seasonal" | "product_launch" | "retention" | "clearance";
export type CampaignObjective =
  | "increase_sales"
  | "generate_leads"
  | "brand_awareness"
  | "customer_engagement"
  | "clearance";

export interface ICampaign extends Document {
  _id: Types.ObjectId;
  name: string;
  campaignType: CampaignType;
  objective: CampaignObjective;
  shortDescription?: string;
  tags: string[];
  channel: CampaignChannel;
  channels: CampaignChannel[];
  segment: { minOrders?: number; minSpend?: number; role?: string; label?: string };
  subject?: string;
  message: string;
  contentHtml?: string;
  startsAt?: Date;
  endsAt?: Date;
  timezone: string;
  totalBudget?: number;
  dailyBudget?: number;
  maxDiscount?: number;
  scheduledAt?: Date;
  status: CampaignStatus;
  stats: { sent: number; opened: number; clicked: number };
}

const campaignSchema = new Schema<ICampaign>(
  {
    name: { type: String, required: true, trim: true },
    campaignType: {
      type: String,
      enum: ["promotional", "seasonal", "product_launch", "retention", "clearance"],
      default: "promotional",
    },
    objective: {
      type: String,
      enum: ["increase_sales", "generate_leads", "brand_awareness", "customer_engagement", "clearance"],
      default: "increase_sales",
    },
    shortDescription: { type: String, trim: true },
    tags: { type: [String], default: [] },
    channel: { type: String, enum: ["email", "sms", "push", "multi"], default: "email" },
    channels: { type: [String], default: ["email"] },
    segment: {
      minOrders: { type: Number },
      minSpend: { type: Number },
      role: { type: String },
      label: { type: String },
    },
    subject: { type: String },
    message: { type: String, default: "" },
    contentHtml: { type: String },
    startsAt: { type: Date },
    endsAt: { type: Date },
    timezone: { type: String, default: "Asia/Kolkata" },
    totalBudget: { type: Number, min: 0 },
    dailyBudget: { type: Number, min: 0 },
    maxDiscount: { type: Number, min: 0, max: 100 },
    scheduledAt: { type: Date },
    status: {
      type: String,
      enum: ["draft", "scheduled", "sent", "active", "ended"],
      default: "draft",
    },
    stats: {
      sent: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const Campaign = model<ICampaign>("Campaign", campaignSchema);
