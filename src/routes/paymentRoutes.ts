import { Router } from "express";
import {
  createRazorpayOrder,
  getPaymentConfig,
  markPaymentFailed,
  verifyRazorpayPayment,
} from "../controllers/paymentController";
import { protect } from "../middleware/auth";

const router = Router();

router.get("/config", getPaymentConfig);
router.post("/razorpay/create-order", protect, createRazorpayOrder);
router.post("/razorpay/orders/:orderId", protect, createRazorpayOrder);
router.post("/razorpay/verify", protect, verifyRazorpayPayment);
router.post("/razorpay/failed", protect, markPaymentFailed);

export default router;
