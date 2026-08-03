import { Schema, model, Document, Types } from "mongoose";

export interface IPaymentGatewaySettings extends Document {
  _id: Types.ObjectId;
  provider: string;
  enabled: boolean;
  credentials: Record<string, string>;
  settlementAccount?: string;
}

const paymentGatewaySettingsSchema = new Schema<IPaymentGatewaySettings>(
  {
    provider: { type: String, required: true, unique: true, trim: true },
    enabled: { type: Boolean, default: false },
    credentials: { type: Schema.Types.Mixed, default: {}, select: false },
    settlementAccount: { type: String },
  },
  { timestamps: true }
);

export const PaymentGatewaySettings = model<IPaymentGatewaySettings>(
  "PaymentGatewaySettings",
  paymentGatewaySettingsSchema
);
