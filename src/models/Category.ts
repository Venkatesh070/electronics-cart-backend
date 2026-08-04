import { Schema, model, Document, Types } from "mongoose";

export type CategoryStatus = "ACTIVE" | "INACTIVE" | "DRAFT";
export type CategoryVisibility = "public" | "private";

export interface ICategory extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  image?: string;
  banner?: string;
  shortDescription?: string;
  description?: string;
  parent?: Types.ObjectId;
  order: number;
  status: CategoryStatus;
  visibility: CategoryVisibility;
  showInMenu: boolean;
  featured: boolean;
  seo: {
    title?: string;
    description?: string;
    keywords?: string;
  };
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    image: { type: String },
    banner: { type: String },
    shortDescription: { type: String, trim: true },
    description: { type: String },
    parent: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    order: { type: Number, default: 0 },
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
    showInMenu: { type: Boolean, default: true },
    featured: { type: Boolean, default: false },
    seo: {
      title: { type: String },
      description: { type: String },
      keywords: { type: String },
    },
  },
  { timestamps: true }
);

export const Category = model<ICategory>("Category", categorySchema);
