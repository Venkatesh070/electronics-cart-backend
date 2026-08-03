import { Schema, model, Document, Types } from "mongoose";

export interface IBlogPost extends Document {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  category: string;
  content: string;
  coverImage?: string;
  author: Types.ObjectId;
  status: "draft" | "published";
  publishedAt?: Date;
}

const blogPostSchema = new Schema<IBlogPost>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    category: { type: String, required: true, index: true },
    content: { type: String, required: true },
    coverImage: { type: String },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

export const BlogPost = model<IBlogPost>("BlogPost", blogPostSchema);
