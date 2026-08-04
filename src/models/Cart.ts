import { Schema, model, Document, Types } from "mongoose";

export interface ICartItem {
  product: Types.ObjectId;
  variantSku?: string;
  quantity: number;
}

export interface IAppliedGiftCard {
  code: string;
  amountApplied: number;
}

export interface ICart extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  items: ICartItem[];
  couponCode?: string;
  giftCards: IAppliedGiftCard[];
}

const cartItemSchema = new Schema<ICartItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantSku: { type: String, trim: true, uppercase: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false }
);

const appliedGiftCardSchema = new Schema<IAppliedGiftCard>(
  {
    code: { type: String, required: true },
    amountApplied: { type: Number, required: true },
  },
  { _id: false }
);

const cartSchema = new Schema<ICart>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
    couponCode: { type: String },
    giftCards: { type: [appliedGiftCardSchema], default: [] },
  },
  { timestamps: true }
);

export const Cart = model<ICart>("Cart", cartSchema);
