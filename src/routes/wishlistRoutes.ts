import { Router } from "express";
import {
  addToWishlist,
  getSharedWishlist,
  getWishlist,
  moveToCart,
  removeFromWishlist,
} from "../controllers/wishlistController";
import { protect } from "../middleware/auth";

const router = Router();

router.get("/shared/:wishlistId", getSharedWishlist);

router.use(protect);
router.get("/", getWishlist);
router.post("/items", addToWishlist);
router.delete("/items/:productId", removeFromWishlist);
router.post("/items/:productId/move-to-cart", moveToCart);

export default router;
