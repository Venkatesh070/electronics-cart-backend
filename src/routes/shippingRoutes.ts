import { Router } from "express";
import { estimateDelivery, getCheckoutShippingOptions, listPublicShippingZones } from "../controllers/shippingController";
import { protect } from "../middleware/auth";

const router = Router();

router.get("/estimate", estimateDelivery);
router.get("/zones", listPublicShippingZones);
router.get("/options", protect, getCheckoutShippingOptions);

export default router;
