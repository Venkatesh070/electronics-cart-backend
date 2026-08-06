import { Router } from "express";
import {
  adminListReturns,
  createReturn,
  getReturn,
  listMyReturns,
  updateReturnStatus,
  syncReturnShiprocket,
  shiprocketReturnWebhook,
} from "../controllers/returnController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

// Public Shiprocket webhook (optional secret via env)
router.post("/shiprocket/webhook", shiprocketReturnWebhook);

router.use(protect);

router.post("/", createReturn);
router.get("/", listMyReturns);
router.get("/admin", requirePermission("returns", "view"), adminListReturns);
router.get("/:id", getReturn);
router.put("/:id/status", requirePermission("returns", "edit"), updateReturnStatus);
router.post("/:id/shiprocket/sync", requirePermission("returns", "edit"), syncReturnShiprocket);

export default router;
