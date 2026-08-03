import { Schema, model, Document, Types } from "mongoose";

export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  user?: Types.ObjectId;
  userName?: string;
  module: string;
  action: string;
  targetId?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
    module: { type: String, required: true, index: true },
    action: { type: String, required: true },
    targetId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AuditLog = model<IAuditLog>("AuditLog", auditLogSchema);
