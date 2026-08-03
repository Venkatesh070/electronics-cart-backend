import { Schema, model, Document, Types } from "mongoose";

export interface IGiftCardDenomination extends Document {
  _id: Types.ObjectId;
  amount: number;
  image?: string;
  active: boolean;
}

const giftCardDenominationSchema = new Schema<IGiftCardDenomination>(
  {
    amount: { type: Number, required: true, min: 1, unique: true },
    image: { type: String },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const GiftCardDenomination = model<IGiftCardDenomination>(
  "GiftCardDenomination",
  giftCardDenominationSchema
);
