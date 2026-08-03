import { Router } from "express";
import { getAnalytics } from "../controllers/analyticsController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.get("/", protect, requirePermission("analytics", "view"), getAnalytics);

export default router;
