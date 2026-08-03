import { Router } from "express";
import {
  addMessage,
  adminListTickets,
  closeTicket,
  createTicket,
  getTicket,
  listMyTickets,
} from "../controllers/ticketController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.use(protect);

router.post("/", createTicket);
router.get("/", listMyTickets);
router.get("/admin", requirePermission("support", "view"), adminListTickets);
router.get("/:id", getTicket);
router.post("/:id/messages", addMessage);
router.put("/:id/close", requirePermission("support", "edit"), closeTicket);

export default router;
