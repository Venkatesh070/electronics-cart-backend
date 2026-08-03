import { Router } from "express";
import {
  createDenomination,
  deleteDenomination,
  issueGiftCard,
  listDenominations,
  listIssuedGiftCards,
  lookupBalance,
  redeemGiftCard,
  voidGiftCard,
} from "../controllers/giftCardController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.get("/denominations", listDenominations);
router.get("/balance/:code", lookupBalance);
router.post("/redeem", protect, redeemGiftCard);

router.post(
  "/denominations",
  protect,
  requirePermission("gift-cards", "edit"),
  createDenomination
);
router.delete(
  "/denominations/:id",
  protect,
  requirePermission("gift-cards", "delete"),
  deleteDenomination
);

router.get("/", protect, requirePermission("gift-cards", "view"), listIssuedGiftCards);
router.post("/", protect, requirePermission("gift-cards", "edit"), issueGiftCard);
router.put("/:id/void", protect, requirePermission("gift-cards", "edit"), voidGiftCard);

export default router;
