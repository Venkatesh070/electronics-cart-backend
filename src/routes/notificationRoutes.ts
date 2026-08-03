import { Router } from "express";
import { listNotifications, markAllAsRead, markAsRead } from "../controllers/notificationController";
import { protect } from "../middleware/auth";

const router = Router();

router.use(protect);

router.get("/", listNotifications);
router.put("/:id/read", markAsRead);
router.put("/read-all", markAllAsRead);

export default router;
