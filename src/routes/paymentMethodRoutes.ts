import { Router } from "express";
import {
  addPaymentMethod,
  listPaymentMethods,
  removePaymentMethod,
  setDefaultPaymentMethod,
} from "../controllers/paymentMethodController";
import { protect } from "../middleware/auth";

const router = Router();

router.use(protect);

router.get("/", listPaymentMethods);
router.post("/", addPaymentMethod);
router.put("/:id/default", setDefaultPaymentMethod);
router.delete("/:id", removePaymentMethod);

export default router;
