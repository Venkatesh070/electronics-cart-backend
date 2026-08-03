import { Router } from "express";
import {
  bulkDelete,
  bulkUpdateStatus,
  compareProducts,
  createProduct,
  deleteProduct,
  getProduct,
  getProductBySlug,
  getRelatedProducts,
  listLowStock,
  listProducts,
  updateProduct,
} from "../controllers/productController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.get("/", listProducts);
router.get("/compare", compareProducts);
router.get("/low-stock", protect, requirePermission("inventory", "view"), listLowStock);
router.get("/slug/:slug", getProductBySlug);
router.get("/:id/related", getRelatedProducts);
router.get("/:id", getProduct);

router.post("/", protect, requirePermission("products", "edit"), createProduct);
router.put("/bulk-status", protect, requirePermission("products", "edit"), bulkUpdateStatus);
router.delete("/bulk", protect, requirePermission("products", "delete"), bulkDelete);
router.put("/:id", protect, requirePermission("products", "edit"), updateProduct);
router.delete("/:id", protect, requirePermission("products", "delete"), deleteProduct);

export default router;
