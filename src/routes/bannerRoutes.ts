import { Router } from "express";
import {
  createBanner,
  deleteBanner,
  listActiveBanners,
  listAllBanners,
  updateBanner,
} from "../controllers/bannerController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.get("/", listActiveBanners);
router.get("/admin", protect, requirePermission("banners", "view"), listAllBanners);
router.post("/", protect, requirePermission("banners", "edit"), createBanner);
router.put("/:id", protect, requirePermission("banners", "edit"), updateBanner);
router.delete("/:id", protect, requirePermission("banners", "delete"), deleteBanner);

export default router;
