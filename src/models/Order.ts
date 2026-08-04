import { Schema, model, Document, Types } from "mongoose";

export interface IOrderItem {
  product: Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  variantSku?: string;
  variantLabel?: string;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "paid"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export interface IStatusHistoryEntry {
  status: OrderStatus;
  note?: string;
  at: Date;
}

export interface IOrder extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  items: IOrderItem[];
  subtotal: number;
  discount: number;
  tax: number;
  shippingFee: number;
  totalAmount: number;
  couponCode?: string;
  giftCardsApplied: { code: string; amountApplied: number }[];
  shippingAddress: {
    fullName: string;
    phone?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  deliverySlot?: string;
  paymentMethod?: string;
  paymentStatus: PaymentStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  status: OrderStatus;
  statusHistory: IStatusHistoryEntry[];
  tracking: {
    courier?: string;
    trackingId?: string;
    url?: string;
  };
  shiprocket?: {
    orderId?: string;
    shipmentId?: string;
    awb?: string;
    status?: string;
    pushedAt?: Date;
    labelUrl?: string;
    invoiceUrl?: string;
    ewaybillNo?: string;
    customerGstin?: string;
  };
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    variantSku: { type: String },
    variantLabel: { type: String },
  },
  { _id: false }
);

const statusHistorySchema = new Schema<IStatusHistoryEntry>(
  {
    status: { type: String, required: true },
    note: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    shippingFee: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    couponCode: { type: String },
    giftCardsApplied: {
      type: [{ code: String, amountApplied: Number }],
      default: [],
    },
    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String },
      line1: { type: String, required: true },
      line2: { type: String },
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
    },
    deliverySlot: { type: String },
    paymentMethod: { type: String },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: { type: String },
    status: {
      type: String,
      enum: ["pending", "confirmed", "paid", "shipped", "out_for_delivery", "delivered", "cancelled"],
      default: "pending",
    },
    statusHistory: { type: [statusHistorySchema], default: [] },
    tracking: {
      courier: { type: String },
      trackingId: { type: String },
      url: { type: String },
    },
    shiprocket: {
      orderId: { type: String },
      shipmentId: { type: String },
      awb: { type: String },
      status: { type: String },
      pushedAt: { type: Date },
      labelUrl: { type: String },
      invoiceUrl: { type: String },
      ewaybillNo: { type: String },
      customerGstin: { type: String },
    },
    cancelReason: { type: String },
  },
  { timestamps: true }
);

// listMyOrders / getOrder ownership checks and admin filtering all query by user,
// sorted by createdAt — index the pair so those stay fast as orders grow.
orderSchema.index({ user: 1, createdAt: -1 });

export const Order = model<IOrder>("Order", orderSchema);
