import { Schema, model, Document, Types } from "mongoose";
import crypto from "crypto";

export type GiftCardStatus = "active" | "void" | "expired";

export interface IGiftCard extends Document {
  _id: Types.ObjectId;
  code: string;
  initialBalance: number;
  balance: number;
  issuedTo?: Types.ObjectId;
  issuedToEmail?: string;
  status: GiftCardStatus;
  expiresAt?: Date;
}

const giftCardSchema = new Schema<IGiftCard>(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    initialBalance: { type: Number, required: true, min: 0 },
    balance: { type: Number, required: true, min: 0 },
    issuedTo: { type: Schema.Types.ObjectId, ref: "User" },
    issuedToEmail: { type: String, trim: true, lowercase: true },
    status: { type: String, enum: ["active", "void", "expired"], default: "active" },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

export function generateGiftCardCode(): string {
  return `GC-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

export const GiftCard = model<IGiftCard>("GiftCard", giftCardSchema);
