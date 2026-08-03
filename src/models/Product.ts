import { Schema, model, Document, Types } from "mongoose";

export interface IProductImage {
  url: string;
  isPrimary: boolean;
}

export interface IProductSpec {
  key: string;
  value: string;
}

export interface IProductVariant {
  sku: string;
  color?: string;
  storage?: string;
  condition: "new" | "refurbished";
  price: number;
  stock: number;
  images: string[];
}

/** ACTIVE = live on storefront, DRAFT = hidden work-in-progress, INACTIVE = archived */
export type ProductStatus = "ACTIVE" | "DRAFT" | "INACTIVE";

export interface IProduct extends Document {
  _id: Types.ObjectId;
  sku: string;
  slug: string;
  name: string;
  category: Types.ObjectId;
  brand: Types.ObjectId;
  shortDescription?: string;
  description: string;
  price: number;
  originalPrice?: number;
  discount: number;
  tax: number;
  stock: number;
  minStock: number;
  status: ProductStatus;
  featured: boolean;
  bestSeller: boolean;
  newArrival: boolean;
  warranty?: string;
  images: IProductImage[];
  specifications: IProductSpec[];
  video?: string;
  variants: IProductVariant[];
  boxContents: string[];
  ratingsAverage: number;
  ratingsCount: number;
  seo: {
    title?: string;
    description?: string;
    keywords?: string[];
  };
}

const imageSchema = new Schema<IProductImage>(
  {
    url: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false }
);

const specSchema = new Schema<IProductSpec>(
  {
    key: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const variantSchema = new Schema<IProductVariant>(
  {
    sku: { type: String, required: true },
    color: { type: String },
    storage: { type: String },
    condition: { type: String, enum: ["new", "refurbished"], default: "new" },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    images: { type: [String], default: [] },
  },
  { _id: false }
);

const productSchema = new Schema<IProduct>(
  {
    sku: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true, index: true },
    brand: { type: Schema.Types.ObjectId, ref: "Brand", required: true, index: true },
    shortDescription: { type: String, trim: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0 },
    discount: { type: Number, default: 0, min: 0, max: 100 },
    tax: { type: Number, default: 0, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    minStock: { type: Number, default: 5, min: 0 },
    status: {
      type: String,
      enum: ["ACTIVE", "DRAFT", "INACTIVE"],
      default: "DRAFT",
      index: true,
    },
    featured: { type: Boolean, default: false, index: true },
    bestSeller: { type: Boolean, default: false },
    newArrival: { type: Boolean, default: false },
    warranty: { type: String },
    images: { type: [imageSchema], default: [] },
    specifications: { type: [specSchema], default: [] },
    video: { type: String },
    variants: { type: [variantSchema], default: [] },
    boxContents: { type: [String], default: [] },
    ratingsAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingsCount: { type: Number, default: 0 },
    seo: {
      title: { type: String },
      description: { type: String },
      keywords: { type: [String], default: [] },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/** Convenience aliases for API consumers */
productSchema.virtual("categoryId").get(function (this: IProduct) {
  return this.category;
});
productSchema.virtual("brandId").get(function (this: IProduct) {
  return this.brand;
});

productSchema.index({ name: "text", description: "text", shortDescription: "text", sku: "text" });

export const Product = model<IProduct>("Product", productSchema);
