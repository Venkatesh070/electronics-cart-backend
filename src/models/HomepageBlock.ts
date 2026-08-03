import { Schema, model, Document, Types } from "mongoose";

export type HomepageBlockType =
  | "hero_carousel"
  | "category_grid"
  | "featured_brands"
  | "flash_sale"
  | "product_carousel"
  | "trust_badges"
  | "newsletter";

export interface IHomepageBlock extends Document {
  _id: Types.ObjectId;
  type: HomepageBlockType;
  config: Record<string, unknown>;
  order: number;
  active: boolean;
}

const homepageBlockSchema = new Schema<IHomepageBlock>(
  {
    type: {
      type: String,
      enum: [
        "hero_carousel",
        "category_grid",
        "featured_brands",
        "flash_sale",
        "product_carousel",
        "trust_badges",
        "newsletter",
      ],
      required: true,
    },
    config: { type: Schema.Types.Mixed, default: {} },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const HomepageBlock = model<IHomepageBlock>("HomepageBlock", homepageBlockSchema);
