import { Schema, model, Document, Types } from "mongoose";
import bcrypt from "bcryptjs";

export type UserRole = "customer" | "support" | "manager" | "admin" | "superadmin";
export type AuthProvider = "password" | "google" | "phone" | "firebase";

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  firebaseUid?: string;
  authProviders: AuthProvider[];
  dob?: Date;
  password?: string;
  role: UserRole;
  adminRole?: Types.ObjectId;
  isBlocked: boolean;
  avatar?: string;
  notificationPreferences: {
    orderUpdates: boolean;
    priceDrops: boolean;
    promotions: boolean;
    supportReplies: boolean;
  };
  adminNotes: { author: Types.ObjectId; text: string; at: Date }[];
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, unique: true, sparse: true, trim: true },
    firebaseUid: { type: String, unique: true, sparse: true, index: true },
    authProviders: {
      type: [String],
      enum: ["password", "google", "phone", "firebase"],
      default: [],
    },
    dob: { type: Date },
    password: { type: String, minlength: 6, select: false },
    role: {
      type: String,
      enum: ["customer", "support", "manager", "admin", "superadmin"],
      default: "customer",
    },
    adminRole: { type: Schema.Types.ObjectId, ref: "AdminRole" },
    isBlocked: { type: Boolean, default: false },
    avatar: { type: String },
    notificationPreferences: {
      orderUpdates: { type: Boolean, default: true },
      priceDrops: { type: Boolean, default: true },
      promotions: { type: Boolean, default: true },
      supportReplies: { type: Boolean, default: true },
    },
    adminNotes: {
      type: [
        {
          author: { type: Schema.Types.ObjectId, ref: "User" },
          text: { type: String, required: true },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidate: string) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

export const STAFF_ROLES: UserRole[] = ["support", "manager", "admin", "superadmin"];

export const User = model<IUser>("User", userSchema);
