import { Router } from "express";
import {
  adminListOrders,
  cancelOrder,
  createOrder,
  getOrder,
  getOrderInvoice,
  getOrderTracking,
  listMyOrders,
  reorder,
  updateOrderStatus,
} from "../controllers/orderController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.use(protect);

router.post("/", createOrder);
router.get("/", listMyOrders);
router.get("/admin", requirePermission("orders", "view"), adminListOrders);
router.get("/:id", getOrder);
router.get("/:id/tracking", getOrderTracking);
router.get("/:id/invoice", getOrderInvoice);
router.post("/:id/cancel", cancelOrder);
router.post("/:id/reorder", reorder);
router.put("/:id/status", requirePermission("orders", "edit"), updateOrderStatus);

export default router;
