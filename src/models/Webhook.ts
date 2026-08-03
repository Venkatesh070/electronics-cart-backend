import { Schema, model, Document, Types } from "mongoose";

export interface IWebhook extends Document {
  _id: Types.ObjectId;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  lastDeliveryStatus?: string;
  lastDeliveryAt?: Date;
}

const webhookSchema = new Schema<IWebhook>(
  {
    url: { type: String, required: true },
    events: { type: [String], required: true },
    secret: { type: String, required: true },
    active: { type: Boolean, default: true },
    lastDeliveryStatus: { type: String },
    lastDeliveryAt: { type: Date },
  },
  { timestamps: true }
);

export const Webhook = model<IWebhook>("Webhook", webhookSchema);
