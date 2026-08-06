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
    // "inclusive" matches how prices are shown storefront-wide ("Inclusive of all taxes") —
    // computeTax() adds nothing on top for inclusive rules, so the checkout total stays
    // equal to the price the customer already saw. Only use "exclusive" if product prices
    // are deliberately displayed tax-exclusive somewhere.
    priceMode: { type: String, enum: ["inclusive", "exclusive"], default: "inclusive" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const TaxRule = model<ITaxRule>("TaxRule", taxRuleSchema);
