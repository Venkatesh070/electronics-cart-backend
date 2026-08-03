import { Schema, model, Document, Types } from "mongoose";

export interface IWishlistItem {
  product: Types.ObjectId;
  addedAt: Date;
  priceWhenAdded: number;
}

export interface IWishlist extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  items: IWishlistItem[];
}

const wishlistItemSchema = new Schema<IWishlistItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    addedAt: { type: Date, default: Date.now },
    priceWhenAdded: { type: Number, required: true },
  },
  { _id: false }
);

const wishlistSchema = new Schema<IWishlist>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: { type: [wishlistItemSchema], default: [] },
  },
  { timestamps: true }
);

export const Wishlist = model<IWishlist>("Wishlist", wishlistSchema);
