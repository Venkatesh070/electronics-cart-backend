import { Router } from "express";
import { Types } from "mongoose";
import {
  createBrand,
  deleteBrand,
  getBrandById,
  getBrandBySlug,
  listBrands,
  updateBrand,
} from "../controllers/brandController";
import { protect, requirePermission } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get("/", listBrands);
router.post("/", protect, requirePermission("brands", "edit"), createBrand);
router.get(
  "/:idOrSlug",
  asyncHandler(async (req, res, next) => {
    const value = req.params.idOrSlug;
    if (Types.ObjectId.isValid(value) && String(new Types.ObjectId(value)) === value) {
      (req.params as { id?: string }).id = value;
      return getBrandById(req, res, next);
    }
    (req.params as { slug?: string }).slug = value;
    return getBrandBySlug(req, res, next);
  })
);
router.put("/:id", protect, requirePermission("brands", "edit"), updateBrand);
router.delete("/:id", protect, requirePermission("brands", "delete"), deleteBrand);

export default router;
