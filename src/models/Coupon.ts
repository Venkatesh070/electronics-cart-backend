import { Schema, model, Document, Types } from "mongoose";

export type CouponType = "flat" | "percent";

export interface ICouponRedemption {
  user: Types.ObjectId;
  order?: Types.ObjectId;
  redeemedAt: Date;
}

export interface ICoupon extends Document {
  _id: Types.ObjectId;
  code: string;
  type: CouponType;
  value: number;
  minOrderValue: number;
  usageLimit?: number;
  perUserLimit: number;
  validFrom: Date;
  validTo: Date;
  applicableCategories: Types.ObjectId[];
  applicableProducts: Types.ObjectId[];
  active: boolean;
  redemptions: ICouponRedemption[];
}

const redemptionSchema = new Schema<ICouponRedemption>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order" },
    redeemedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const couponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ["flat", "percent"], required: true },
    value: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0 },
    usageLimit: { type: Number },
    perUserLimit: { type: Number, default: 1 },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    applicableCategories: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    applicableProducts: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    active: { type: Boolean, default: true },
    redemptions: { type: [redemptionSchema], default: [] },
  },
  { timestamps: true }
);

export const Coupon = model<ICoupon>("Coupon", couponSchema);
