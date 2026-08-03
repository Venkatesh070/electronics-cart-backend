import { Schema, model, Document, Types } from "mongoose";

export interface IPaymentMethod extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  type: "card" | "upi";
  token: string;
  brand?: string;
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
  upiId?: string;
  isDefault: boolean;
}

const paymentMethodSchema = new Schema<IPaymentMethod>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["card", "upi"], required: true },
    token: { type: String, required: true },
    brand: { type: String },
    last4: { type: String },
    expiryMonth: { type: Number },
    expiryYear: { type: Number },
    upiId: { type: String },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const PaymentMethod = model<IPaymentMethod>("PaymentMethod", paymentMethodSchema);
