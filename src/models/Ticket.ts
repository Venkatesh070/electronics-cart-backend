import { Schema, model, Document, Types } from "mongoose";

export type TicketStatus = "open" | "pending" | "resolved" | "closed";
export type TicketChannel = "web" | "chat" | "whatsapp" | "email";

export interface ITicketMessage {
  sender: Types.ObjectId;
  text: string;
  attachments: string[];
  at: Date;
}

export interface ITicket extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  subject: string;
  order?: Types.ObjectId;
  channel: TicketChannel;
  status: TicketStatus;
  messages: ITicketMessage[];
}

const ticketMessageSchema = new Schema<ITicketMessage>(
  {
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    attachments: { type: [String], default: [] },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ticketSchema = new Schema<ITicket>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subject: { type: String, required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order" },
    channel: { type: String, enum: ["web", "chat", "whatsapp", "email"], default: "web" },
    status: { type: String, enum: ["open", "pending", "resolved", "closed"], default: "open" },
    messages: { type: [ticketMessageSchema], default: [] },
  },
  { timestamps: true }
);

export const Ticket = model<ITicket>("Ticket", ticketSchema);
