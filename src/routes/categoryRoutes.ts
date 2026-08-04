import { Router } from "express";
import { Types } from "mongoose";
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  getCategoryBySlug,
  listCategories,
  reorderCategories,
  updateCategory,
} from "../controllers/categoryController";
import { protect, requirePermission } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get("/", listCategories);
router.put("/reorder", protect, requirePermission("categories", "edit"), reorderCategories);
router.post("/", protect, requirePermission("categories", "edit"), createCategory);
router.get(
  "/:idOrSlug",
  asyncHandler(async (req, res, next) => {
    const value = req.params.idOrSlug;
    if (Types.ObjectId.isValid(value) && String(new Types.ObjectId(value)) === value) {
      (req.params as { id?: string }).id = value;
      return getCategoryById(req, res, next);
    }
    (req.params as { slug?: string }).slug = value;
    return getCategoryBySlug(req, res, next);
  })
);
router.put("/:id", protect, requirePermission("categories", "edit"), updateCategory);
router.delete("/:id", protect, requirePermission("categories", "delete"), deleteCategory);

export default router;
