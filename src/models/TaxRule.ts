import { Schema, model, Document, Types } from "mongoose";

export interface ITaxRule extends Document {
  _id: Types.ObjectId;
  region: string;
  category?: Types.ObjectId;
  ratePercent: number;
  priceMode: "inclusive" | "exclusive";
  active: boolean;
}

const taxRuleSchema = new Schema<ITaxRule>(
  {
    region: { type: String, required: true, trim: true },
    category: { type: Schema.Types.ObjectId, ref: "Category" },
    ratePercent: { type: Number, required: true, min: 0 },
    priceMode: { type: String, enum: ["inclusive", "exclusive"], default: "exclusive" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const TaxRule = model<ITaxRule>("TaxRule", taxRuleSchema);
