import { Schema, model, Document, Types } from "mongoose";

export interface IFlashSaleProduct {
  product: Types.ObjectId;
  discountPercent: number;
  stockCap: number;
  soldCount: number;
}

export interface IFlashSale extends Document {
  _id: Types.ObjectId;
  name: string;
  products: IFlashSaleProduct[];
  startsAt: Date;
  endsAt: Date;
  active: boolean;
}

const flashSaleProductSchema = new Schema<IFlashSaleProduct>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    discountPercent: { type: Number, required: true, min: 0, max: 100 },
    stockCap: { type: Number, required: true, min: 0 },
    soldCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const flashSaleSchema = new Schema<IFlashSale>(
  {
    name: { type: String, required: true },
    products: { type: [flashSaleProductSchema], default: [] },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const FlashSale = model<IFlashSale>("FlashSale", flashSaleSchema);
