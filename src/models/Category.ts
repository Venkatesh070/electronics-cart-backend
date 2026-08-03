import { Schema, model, Document, Types } from "mongoose";

export interface ICategory extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  image?: string;
  description?: string;
  parent?: Types.ObjectId;
  order: number;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    image: { type: String },
    description: { type: String },
    parent: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Category = model<ICategory>("Category", categorySchema);
