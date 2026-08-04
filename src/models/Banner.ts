import { Schema, model, Document, Types } from "mongoose";

export type BannerPlacement = "home" | "category";

export interface IBanner extends Document {
  _id: Types.ObjectId;
  title: string;
  titleHighlight?: string;
  subtitle?: string;
  badge?: string;
  buttonText?: string;
  secondaryButtonText?: string;
  secondaryLinkTarget?: string;
  promoText?: string;
  image?: string;
  backgroundImage?: string;
  linkTarget?: string;
  features: string[];
  placement: BannerPlacement;
  startDate: Date;
  endDate: Date;
  priority: number;
  active: boolean;
}

const bannerSchema = new Schema<IBanner>(
  {
    title: { type: String, required: true },
    titleHighlight: { type: String },
    subtitle: { type: String },
    badge: { type: String },
    buttonText: { type: String },
    secondaryButtonText: { type: String },
    secondaryLinkTarget: { type: String },
    promoText: { type: String },
    image: { type: String },
    backgroundImage: { type: String },
    linkTarget: { type: String },
    features: { type: [String], default: [] },
    placement: { type: String, enum: ["home", "category"], default: "home" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    priority: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Banner = model<IBanner>("Banner", bannerSchema);
