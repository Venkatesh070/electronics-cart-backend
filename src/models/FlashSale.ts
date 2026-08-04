import { Schema, model, Document, Types } from "mongoose";

export type FlashSaleType = "sitewide" | "product_specific";
export type FlashDiscountType = "percentage" | "fixed";
export type FlashApplicableOn = "all" | "selected";
export type FlashSaleStatus = "ACTIVE" | "DRAFT" | "INACTIVE";
export type FlashBackgroundMode = "auto" | "preset" | "gradient" | "image";

export interface IFlashSaleBackground {
  mode: FlashBackgroundMode;
  /** Named presets when mode === "preset" */
  preset?: string;
  colorFrom?: string;
  colorTo?: string;
  image?: string;
}

export interface IFlashSaleProduct {
  product: Types.ObjectId;
  discountPercent: number;
  stockCap: number;
  soldCount: number;
}

export interface IFlashSaleCategory {
  category: Types.ObjectId;
  discountPercent: number;
}

export interface IFlashSale extends Document {
  _id: Types.ObjectId;
  name: string;
  shortDescription?: string;
  saleType: FlashSaleType;
  products: IFlashSaleProduct[];
  categories: IFlashSaleCategory[];
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  discountType: FlashDiscountType;
  discountValue: number;
  maxDiscount?: number;
  minPurchase?: number;
  applicableOn: FlashApplicableOn;
  status: FlashSaleStatus;
  active: boolean;
  bannerBackground: IFlashSaleBackground;
}

const flashSaleProductSchema = new Schema<IFlashSaleProduct>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    discountPercent: { type: Number, required: true, min: 0, max: 100 },
    stockCap: { type: Number, required: true, min: 0, default: 0 },
    soldCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const flashSaleCategorySchema = new Schema<IFlashSaleCategory>(
  {
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    discountPercent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const flashSaleBackgroundSchema = new Schema<IFlashSaleBackground>(
  {
    mode: {
      type: String,
      enum: ["auto", "preset", "gradient", "image"],
      default: "auto",
    },
    preset: { type: String, trim: true },
    colorFrom: { type: String, trim: true },
    colorTo: { type: String, trim: true },
    image: { type: String, trim: true },
  },
  { _id: false }
);

const flashSaleSchema = new Schema<IFlashSale>(
  {
    name: { type: String, required: true, trim: true },
    shortDescription: { type: String, trim: true },
    saleType: {
      type: String,
      enum: ["sitewide", "product_specific"],
      default: "sitewide",
    },
    products: { type: [flashSaleProductSchema], default: [] },
    categories: { type: [flashSaleCategorySchema], default: [] },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    timezone: { type: String, default: "Asia/Kolkata" },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      default: "percentage",
    },
    discountValue: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, min: 0 },
    minPurchase: { type: Number, min: 0 },
    applicableOn: {
      type: String,
      enum: ["all", "selected"],
      default: "all",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "DRAFT", "INACTIVE"],
      default: "DRAFT",
      index: true,
    },
    active: { type: Boolean, default: true },
    bannerBackground: {
      type: flashSaleBackgroundSchema,
      default: () => ({ mode: "auto", preset: "ember" }),
    },
  },
  { timestamps: true }
);

export const FlashSale = model<IFlashSale>("FlashSale", flashSaleSchema);
