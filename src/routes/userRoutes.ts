import { Router } from "express";
import {
  changePassword,
  removeAvatar,
  updateNotificationPreferences,
  updateProfile,
  uploadAvatar,
} from "../controllers/userController";
import { protect } from "../middleware/auth";
import { uploadImage } from "../middleware/upload";

const router = Router();

router.use(protect);

router.put("/me", updateProfile);
router.put("/me/password", changePassword);
router.put("/me/notification-preferences", updateNotificationPreferences);
// Force the destination folder server-side (uploadImage's storage picks the folder off
// req.query.folder) so this route always writes to uploads/avatars regardless of what
// the client sends.
router.post(
  "/me/avatar",
  (req, _res, next) => {
    req.query.folder = "avatars";
    next();
  },
  uploadImage.single("file"),
  uploadAvatar
);
router.delete("/me/avatar", removeAvatar);

export default router;
