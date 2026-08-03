import { Router } from "express";
import {
  createCategory,
  deleteCategory,
  getCategoryBySlug,
  listCategories,
  reorderCategories,
  updateCategory,
} from "../controllers/categoryController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.get("/", listCategories);
router.get("/:slug", getCategoryBySlug);
router.post("/", protect, requirePermission("categories", "edit"), createCategory);
router.put("/reorder", protect, requirePermission("categories", "edit"), reorderCategories);
router.put("/:id", protect, requirePermission("categories", "edit"), updateCategory);
router.delete("/:id", protect, requirePermission("categories", "delete"), deleteCategory);

export default router;
