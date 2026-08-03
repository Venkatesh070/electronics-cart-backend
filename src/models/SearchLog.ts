import { Schema, model, Document, Types } from "mongoose";

export interface ISearchLog extends Document {
  _id: Types.ObjectId;
  user?: Types.ObjectId;
  query: string;
  resultsCount: number;
  createdAt: Date;
}

const searchLogSchema = new Schema<ISearchLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    query: { type: String, required: true, trim: true, lowercase: true, index: true },
    resultsCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const SearchLog = model<ISearchLog>("SearchLog", searchLogSchema);
