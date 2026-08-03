import { Schema, model, Document, Types } from "mongoose";

export interface IBrand extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  logo?: string;
  featured: boolean;
}

const brandSchema = new Schema<IBrand>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    logo: { type: String },
    featured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Brand = model<IBrand>("Brand", brandSchema);
