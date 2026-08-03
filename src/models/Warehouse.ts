import { Schema, model, Document, Types } from "mongoose";

export interface IWarehouse extends Document {
  _id: Types.ObjectId;
  name: string;
  location: string;
}

const warehouseSchema = new Schema<IWarehouse>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    location: { type: String, required: true },
  },
  { timestamps: true }
);

export const Warehouse = model<IWarehouse>("Warehouse", warehouseSchema);
