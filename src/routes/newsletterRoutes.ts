import { Router } from "express";
import { listSubscribers, subscribe, unsubscribe } from "../controllers/newsletterController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.post("/subscribe", subscribe);
router.post("/unsubscribe", unsubscribe);
router.get("/", protect, requirePermission("marketing", "view"), listSubscribers);

export default router;
