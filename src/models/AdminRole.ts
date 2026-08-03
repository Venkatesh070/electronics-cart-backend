import { Schema, model, Document, Types } from "mongoose";

export interface IPermission {
  module: string;
  view: boolean;
  edit: boolean;
  delete: boolean;
}

export interface IAdminRole extends Document {
  _id: Types.ObjectId;
  name: string;
  permissions: IPermission[];
}

const permissionSchema = new Schema<IPermission>(
  {
    module: { type: String, required: true },
    view: { type: Boolean, default: false },
    edit: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
  },
  { _id: false }
);

const adminRoleSchema = new Schema<IAdminRole>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    permissions: { type: [permissionSchema], default: [] },
  },
  { timestamps: true }
);

export const AdminRole = model<IAdminRole>("AdminRole", adminRoleSchema);
