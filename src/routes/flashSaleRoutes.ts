import { Router } from "express";
import {
  createFlashSale,
  deleteFlashSale,
  flashSalePerformance,
  listActiveFlashSales,
  listAllFlashSales,
  updateFlashSale,
} from "../controllers/flashSaleController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.get("/", listActiveFlashSales);
router.get("/admin", protect, requirePermission("flash-sales", "view"), listAllFlashSales);
router.get("/:id/performance", protect, requirePermission("flash-sales", "view"), flashSalePerformance);
router.post("/", protect, requirePermission("flash-sales", "edit"), createFlashSale);
router.put("/:id", protect, requirePermission("flash-sales", "edit"), updateFlashSale);
router.delete("/:id", protect, requirePermission("flash-sales", "delete"), deleteFlashSale);

export default router;
