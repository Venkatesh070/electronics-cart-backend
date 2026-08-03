import { Schema, model, Document, Types } from "mongoose";

export interface IQuestion extends Document {
  _id: Types.ObjectId;
  product: Types.ObjectId;
  user: Types.ObjectId;
  question: string;
  answer?: string;
  answeredBy?: Types.ObjectId;
  answeredAt?: Date;
}

const questionSchema = new Schema<IQuestion>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    question: { type: String, required: true, trim: true },
    answer: { type: String, trim: true },
    answeredBy: { type: Schema.Types.ObjectId, ref: "User" },
    answeredAt: { type: Date },
  },
  { timestamps: true }
);

export const Question = model<IQuestion>("Question", questionSchema);
