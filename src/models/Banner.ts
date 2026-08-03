import { Schema, model, Document, Types } from "mongoose";

export type BannerPlacement = "home" | "category";

export interface IBanner extends Document {
  _id: Types.ObjectId;
  title: string;
  image: string;
  linkTarget?: string;
  placement: BannerPlacement;
  startDate: Date;
  endDate: Date;
  priority: number;
  active: boolean;
}

const bannerSchema = new Schema<IBanner>(
  {
    title: { type: String, required: true },
    image: { type: String, required: true },
    linkTarget: { type: String },
    placement: { type: String, enum: ["home", "category"], default: "home" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    priority: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Banner = model<IBanner>("Banner", bannerSchema);
