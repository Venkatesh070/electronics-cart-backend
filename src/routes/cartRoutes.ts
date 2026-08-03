import { Router } from "express";
import {
  addItem,
  applyCoupon,
  applyGiftCard,
  clearCart,
  getCart,
  getCartRecommendations,
  getCartSummary,
  moveToWishlist,
  removeCoupon,
  removeGiftCard,
  removeItem,
  updateItem,
} from "../controllers/cartController";
import { protect } from "../middleware/auth";

const router = Router();

router.use(protect);

router.get("/", getCart);
router.get("/summary", getCartSummary);
router.get("/recommendations", getCartRecommendations);
router.post("/items", addItem);
router.put("/items/:productId", updateItem);
router.delete("/items/:productId", removeItem);
router.post("/items/:productId/move-to-wishlist", moveToWishlist);
router.delete("/", clearCart);
router.post("/coupon", applyCoupon);
router.delete("/coupon", removeCoupon);
router.post("/gift-card", applyGiftCard);
router.delete("/gift-card/:code", removeGiftCard);

export default router;
