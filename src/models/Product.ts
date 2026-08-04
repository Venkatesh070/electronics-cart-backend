import { Schema, model, Document, Types } from "mongoose";

export interface IProductImage {
  url: string;
  isPrimary: boolean;
}

export interface IProductSpec {
  key: string;
  value: string;
}

export interface IVariantDimensions {
  length?: number;
  breadth?: number;
  height?: number;
}

/** Amazon-style purchasable SKU under a parent product. */
export interface IProductVariant {
  sku: string;
  barcode?: string;
  /** Unlimited attribute map: { Color: "Silver", RAM: "16 GB", Storage: "512 GB SSD" } */
  attributes: Record<string, string>;
  mrp: number;
  sellingPrice: number;
  offerPrice?: number;
  stock: number;
  reservedStock: number;
  minStock: number;
  maxOrderQty?: number;
  weight?: number;
  dimensions?: IVariantDimensions;
  status: "ACTIVE" | "INACTIVE";
  isDefault?: boolean;
  isFeatured?: boolean;
  isBestSeller?: boolean;
  images: IProductImage[];
  /** Spec overrides for this variant (merged over product.specifications on PDP). */
  specifications: IProductSpec[];
  tax?: number;
  codAvailable?: boolean;
  emiAvailable?: boolean;
  exchangeAvailable?: boolean;
  // Legacy fields kept for old documents
  color?: string;
  storage?: string;
  condition?: "new" | "refurbished";
  price?: number;
}

export interface IOptionType {
  name: string;
  values: string[];
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
  condition: "new" | "refurbished";
  warranty?: string;
  returnWindowDays?: number;
  deliveryPromise?: string;
  emiMonths?: number;
  images: IProductImage[];
  specifications: IProductSpec[];
  video?: string;
  /** Declared option axes for selectors (Color, RAM, Storage…). Derived if empty. */
  optionTypes: IOptionType[];
  variants: IProductVariant[];
  defaultVariantSku?: string;
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

const variantSchema = new Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true },
    barcode: { type: String, trim: true },
    attributes: { type: Map, of: String, default: {} },
    mrp: { type: Number, min: 0 },
    sellingPrice: { type: Number, min: 0 },
    offerPrice: { type: Number, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    reservedStock: { type: Number, min: 0, default: 0 },
    minStock: { type: Number, min: 0, default: 0 },
    maxOrderQty: { type: Number, min: 1 },
    weight: { type: Number, min: 0 },
    dimensions: {
      length: { type: Number, min: 0 },
      breadth: { type: Number, min: 0 },
      height: { type: Number, min: 0 },
    },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    isDefault: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    images: { type: [imageSchema], default: [] },
    specifications: { type: [specSchema], default: [] },
    tax: { type: Number, min: 0 },
    codAvailable: { type: Boolean, default: true },
    emiAvailable: { type: Boolean, default: true },
    exchangeAvailable: { type: Boolean, default: false },
    // legacy
    color: { type: String },
    storage: { type: String },
    condition: { type: String, enum: ["new", "refurbished"], default: "new" },
    price: { type: Number, min: 0 },
  },
  { _id: false }
);

const optionTypeSchema = new Schema<IOptionType>(
  {
    name: { type: String, required: true, trim: true },
    values: { type: [String], default: [] },
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
    condition: { type: String, enum: ["new", "refurbished"], default: "new", index: true },
    warranty: { type: String },
    returnWindowDays: { type: Number, min: 0 },
    deliveryPromise: { type: String },
    emiMonths: { type: Number, min: 0 },
    images: { type: [imageSchema], default: [] },
    specifications: { type: [specSchema], default: [] },
    video: { type: String },
    optionTypes: { type: [optionTypeSchema], default: [] },
    variants: { type: [variantSchema], default: [] },
    defaultVariantSku: { type: String, trim: true, uppercase: true },
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

productSchema.virtual("categoryId").get(function (this: IProduct) {
  return this.category;
});
productSchema.virtual("brandId").get(function (this: IProduct) {
  return this.brand;
});

productSchema.index({ name: "text", description: "text", shortDescription: "text", sku: "text" });
productSchema.index({ "variants.sku": 1 });

export const Product = model<IProduct>("Product", productSchema);
