import { Schema, model, Document, Types } from "mongoose";

export interface IFaq extends Document {
  _id: Types.ObjectId;
  category: string;
  question: string;
  answer: string;
  order: number;
}

const faqSchema = new Schema<IFaq>(
  {
    category: { type: String, required: true, trim: true, index: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Faq = model<IFaq>("Faq", faqSchema);
