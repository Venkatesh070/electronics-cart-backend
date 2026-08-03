import { Schema, model, Document, Types } from "mongoose";

export type ReviewStatus = "pending" | "approved" | "rejected" | "flagged";

export interface IReview extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  product: Types.ObjectId;
  order?: Types.ObjectId;
  rating: number;
  text: string;
  photos: string[];
  status: ReviewStatus;
  reportedCount: number;
}

const reviewSchema = new Schema<IReview>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    order: { type: Schema.Types.ObjectId, ref: "Order" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, required: true, trim: true },
    photos: { type: [String], default: [] },
    status: { type: String, enum: ["pending", "approved", "rejected", "flagged"], default: "pending" },
    reportedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

reviewSchema.index({ user: 1, product: 1 }, { unique: true });

export const Review = model<IReview>("Review", reviewSchema);
