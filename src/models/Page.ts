import { Schema, model, Document, Types } from "mongoose";

export interface IPage extends Document {
  _id: Types.ObjectId;
  slug: string;
  title: string;
  content: string;
  status: "draft" | "published";
}

const pageSchema = new Schema<IPage>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
  },
  { timestamps: true }
);

export const Page = model<IPage>("Page", pageSchema);
