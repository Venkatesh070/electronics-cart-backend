import { Schema, model, Document, Types } from "mongoose";

export interface INewsletterSubscriber extends Document {
  _id: Types.ObjectId;
  email: string;
  active: boolean;
  source?: string;
}

const newsletterSchema = new Schema<INewsletterSubscriber>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    active: { type: Boolean, default: true },
    source: { type: String, default: "website" },
  },
  { timestamps: true }
);

export const NewsletterSubscriber = model<INewsletterSubscriber>("NewsletterSubscriber", newsletterSchema);
