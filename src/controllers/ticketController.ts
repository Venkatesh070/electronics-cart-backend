import { Request, Response } from "express";
import { Ticket } from "../models/Ticket";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { STAFF_ROLES } from "../models/User";
import { notifyStaff, notifyUser } from "../utils/notify";

export const createTicket = asyncHandler(async (req: Request, res: Response) => {
  const { subject, orderId, channel, message } = req.body;
  if (!subject || !message) throw new ApiError(400, "subject and message are required");

  const ticket = await Ticket.create({
    user: req.user!._id,
    subject,
    order: orderId,
    channel,
    messages: [{ sender: req.user!._id, text: message, at: new Date() }],
  });

  await notifyStaff("New support ticket", `${req.user!.name} raised a ticket: ${subject}`, ticket._id.toString());

  res.status(201).json({ success: true, data: ticket });
});

export const listMyTickets = asyncHandler(async (req: Request, res: Response) => {
  const tickets = await Ticket.find({ user: req.user!._id }).sort({ updatedAt: -1 });
  res.json({ success: true, data: tickets });
});

export const getTicket = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await Ticket.findById(req.params.id).populate("messages.sender", "name role");
  if (!ticket) throw new ApiError(404, "Ticket not found");

  const isOwner = ticket.user.toString() === req.user!._id.toString();
  if (!isOwner && !STAFF_ROLES.includes(req.user!.role)) throw new ApiError(403, "Not authorized");

  res.json({ success: true, data: ticket });
});

export const addMessage = asyncHandler(async (req: Request, res: Response) => {
  const { text, attachments } = req.body;
  if (!text) throw new ApiError(400, "text is required");

  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) throw new ApiError(404, "Ticket not found");

  const isOwner = ticket.user.toString() === req.user!._id.toString();
  const isStaff = STAFF_ROLES.includes(req.user!.role);
  if (!isOwner && !isStaff) throw new ApiError(403, "Not authorized");

  ticket.messages.push({ sender: req.user!._id, text, attachments: attachments || [], at: new Date() });
  if (isStaff) {
    ticket.status = "pending";
    await notifyUser(ticket.user.toString(), "support_reply", "Support replied", `New reply on your ticket: ${ticket.subject}`, ticket._id.toString());
  } else {
    ticket.status = "open";
  }
  await ticket.save();

  res.json({ success: true, data: ticket });
});

// --- Admin ---

export const adminListTickets = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;

  const tickets = await Ticket.find(filter).populate("user", "name email").sort({ updatedAt: -1 });
  res.json({ success: true, data: tickets });
});

export const closeTicket = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await Ticket.findByIdAndUpdate(req.params.id, { status: "closed" }, { new: true });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  res.json({ success: true, data: ticket });
});
