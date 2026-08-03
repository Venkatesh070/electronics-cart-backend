import { Router } from "express";
import { changePassword, updateNotificationPreferences, updateProfile } from "../controllers/userController";
import { protect } from "../middleware/auth";

const router = Router();

router.use(protect);

router.put("/me", updateProfile);
router.put("/me/password", changePassword);
router.put("/me/notification-preferences", updateNotificationPreferences);

export default router;
