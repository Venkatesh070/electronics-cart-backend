import { Schema, model, Document, Types } from "mongoose";

export type BrandStatus = "ACTIVE" | "INACTIVE" | "DRAFT";
export type BrandVisibility = "public" | "private";

export interface IBrand extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  logo?: string;
  banner?: string;
  icon?: string;
  shortDescription?: string;
  description?: string;
  website?: string;
  supportEmail?: string;
  supportPhone?: string;
  countryOfOrigin?: string;
  establishedYear?: number;
  status: BrandStatus;
  visibility: BrandVisibility;
  featured: boolean;
}

const brandSchema = new Schema<IBrand>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    logo: { type: String },
    banner: { type: String },
    icon: { type: String },
    shortDescription: { type: String, trim: true },
    description: { type: String },
    website: { type: String, trim: true },
    supportEmail: { type: String, trim: true },
    supportPhone: { type: String, trim: true },
    countryOfOrigin: { type: String, trim: true },
    establishedYear: { type: Number, min: 1800, max: 2100 },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "DRAFT"],
      default: "ACTIVE",
      index: true,
    },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public",
    },
    featured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Brand = model<IBrand>("Brand", brandSchema);
