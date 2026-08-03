import { Schema, model, Document, Types } from "mongoose";

export interface IStockAdjustment extends Document {
  _id: Types.ObjectId;
  product: Types.ObjectId;
  variantSku?: string;
  warehouse?: Types.ObjectId;
  change: number;
  reason: string;
  adjustedBy: Types.ObjectId;
  createdAt: Date;
}

const stockAdjustmentSchema = new Schema<IStockAdjustment>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    variantSku: { type: String },
    warehouse: { type: Schema.Types.ObjectId, ref: "Warehouse" },
    change: { type: Number, required: true },
    reason: { type: String, required: true },
    adjustedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const StockAdjustment = model<IStockAdjustment>("StockAdjustment", stockAdjustmentSchema);
