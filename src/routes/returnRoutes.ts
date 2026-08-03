import { Router } from "express";
import {
  adminListReturns,
  createReturn,
  getReturn,
  listMyReturns,
  updateReturnStatus,
} from "../controllers/returnController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.use(protect);

router.post("/", createReturn);
router.get("/", listMyReturns);
router.get("/admin", requirePermission("returns", "view"), adminListReturns);
router.get("/:id", getReturn);
router.put("/:id/status", requirePermission("returns", "edit"), updateReturnStatus);

export default router;
