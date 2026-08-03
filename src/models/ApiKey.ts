import { Schema, model, Document, Types } from "mongoose";
import crypto from "crypto";

export interface IApiKey extends Document {
  _id: Types.ObjectId;
  name: string;
  keyPrefix: string;
  hashedKey: string;
  scopes: string[];
  rateLimitPerMinute: number;
  lastUsedAt?: Date;
  revoked: boolean;
}

const apiKeySchema = new Schema<IApiKey>(
  {
    name: { type: String, required: true },
    keyPrefix: { type: String, required: true },
    hashedKey: { type: String, required: true },
    scopes: { type: [String], default: [] },
    rateLimitPerMinute: { type: Number, default: 60 },
    lastUsedAt: { type: Date },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export function generateApiKey(): { plaintext: string; prefix: string; hashed: string } {
  const plaintext = crypto.randomBytes(24).toString("hex");
  const prefix = plaintext.slice(0, 8);
  const hashed = crypto.createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, prefix, hashed };
}

export const ApiKey = model<IApiKey>("ApiKey", apiKeySchema);
