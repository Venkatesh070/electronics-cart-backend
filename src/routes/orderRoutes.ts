import { Router } from "express";
import {
  adminListOrders,
  cancelOrder,
  createOrder,
  downloadShiprocketInvoice,
  downloadShiprocketLabel,
  getOrder,
  getOrderInvoice,
  getOrderTracking,
  listMyOrders,
  reorder,
  shipWithShiprocket,
  syncShiprocket,
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
router.get("/:id/shiprocket/label", downloadShiprocketLabel);
router.get("/:id/shiprocket/invoice", downloadShiprocketInvoice);
router.post("/:id/shiprocket/sync", syncShiprocket);
router.post("/:id/cancel", cancelOrder);
router.post("/:id/reorder", reorder);
router.put("/:id/status", requirePermission("orders", "edit"), updateOrderStatus);
router.post("/:id/shiprocket", requirePermission("orders", "edit"), shipWithShiprocket);

export default router;
