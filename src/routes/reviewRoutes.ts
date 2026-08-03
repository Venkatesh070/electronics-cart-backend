import { Router } from "express";
import {
  createReview,
  deleteMyReview,
  getPendingDeliveredOrdersForReview,
  listMyReviews,
  listModerationQueue,
  listProductReviews,
  moderateReview,
  reportReview,
  updateMyReview,
} from "../controllers/reviewController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.get("/product/:productId", listProductReviews);

router.use(protect);
router.get("/mine", listMyReviews);
router.get("/pending-prompts", getPendingDeliveredOrdersForReview);
router.post("/", createReview);
router.put("/:id", updateMyReview);
router.delete("/:id", deleteMyReview);
router.post("/:id/report", reportReview);

router.get("/", requirePermission("reviews", "view"), listModerationQueue);
router.put("/:id/moderate", requirePermission("reviews", "edit"), moderateReview);

export default router;
