import { Router } from "express";
import {
  createCoupon,
  deleteCoupon,
  listAvailableCoupons,
  listCoupons,
  updateCoupon,
  validateCoupon,
} from "../controllers/couponController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.use(protect);

router.post("/validate", validateCoupon);
router.get("/available", listAvailableCoupons);

router.get("/", requirePermission("coupons", "view"), listCoupons);
router.post("/", requirePermission("coupons", "edit"), createCoupon);
router.put("/:id", requirePermission("coupons", "edit"), updateCoupon);
router.delete("/:id", requirePermission("coupons", "delete"), deleteCoupon);

export default router;
