import { Router } from "express";
import { estimateDelivery, listPublicShippingZones } from "../controllers/shippingController";

const router = Router();

router.get("/estimate", estimateDelivery);
router.get("/zones", listPublicShippingZones);

export default router;
