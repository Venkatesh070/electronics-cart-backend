import { Router } from "express";
import {
  createBrand,
  deleteBrand,
  getBrandBySlug,
  listBrands,
  updateBrand,
} from "../controllers/brandController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.get("/", listBrands);
router.get("/:slug", getBrandBySlug);
router.post("/", protect, requirePermission("brands", "edit"), createBrand);
router.put("/:id", protect, requirePermission("brands", "edit"), updateBrand);
router.delete("/:id", protect, requirePermission("brands", "delete"), deleteBrand);

export default router;
