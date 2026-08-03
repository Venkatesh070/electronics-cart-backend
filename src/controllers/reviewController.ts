import { Request, Response } from "express";
import { Types } from "mongoose";
import { Review } from "../models/Review";
import { Product } from "../models/Product";
import { Order } from "../models/Order";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { logAudit } from "../utils/auditLog";

async function recomputeProductRating(productId: string) {
  const stats = await Review.aggregate([
    { $match: { product: new Types.ObjectId(productId), status: "approved" } },
    { $group: { _id: "$product", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = stats[0] || {};
  await Product.findByIdAndUpdate(productId, { ratingsAverage: avg, ratingsCount: count });
}

export const listProductReviews = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await Review.find({ product: req.params.productId, status: "approved" })
    .populate("user", "name")
    .sort({ createdAt: -1 });

  const breakdown = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: reviews.filter((r) => r.rating === rating).length,
  }));

  res.json({ success: true, data: { reviews, breakdown, total: reviews.length } });
});

export const listMyReviews = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await Review.find({ user: req.user!._id }).populate("product", "name images slug").sort({ createdAt: -1 });
  res.json({ success: true, data: reviews });
});

export const createReview = asyncHandler(async (req: Request, res: Response) => {
  const { product, rating, text, photos, order } = req.body;
  if (!product || !rating || !text) throw new ApiError(400, "product, rating and text are required");

  const existing = await Review.findOne({ product, user: req.user!._id });
  if (existing) throw new ApiError(409, "You have already reviewed this product");

  if (order) {
    const ownsOrder = await Order.exists({ _id: order, user: req.user!._id });
    if (!ownsOrder) throw new ApiError(403, "Order does not belong to you");
  }

  const review = await Review.create({
    product,
    user: req.user!._id,
    rating,
    text,
    photos,
    order,
  });
  res.status(201).json({ success: true, data: review });
});

export const updateMyReview = asyncHandler(async (req: Request, res: Response) => {
  const { rating, text, photos } = req.body;
  const review = await Review.findOneAndUpdate(
    { _id: req.params.id, user: req.user!._id },
    { rating, text, photos, status: "pending" },
    { new: true, runValidators: true }
  );
  if (!review) throw new ApiError(404, "Review not found");
  await recomputeProductRating(review.product.toString());
  res.json({ success: true, data: review });
});

export const deleteMyReview = asyncHandler(async (req: Request, res: Response) => {
  const review = await Review.findOneAndDelete({ _id: req.params.id, user: req.user!._id });
  if (!review) throw new ApiError(404, "Review not found");
  await recomputeProductRating(review.product.toString());
  res.json({ success: true, data: {} });
});

export const getPendingDeliveredOrdersForReview = asyncHandler(async (req: Request, res: Response) => {
  const orders = await Order.find({ user: req.user!._id, status: "delivered" }).populate("items.product");
  const reviewedProductIds = new Set(
    (await Review.find({ user: req.user!._id }).select("product")).map((r) => r.product.toString())
  );

  const pending = orders.flatMap((order) =>
    order.items
      .filter((item) => !reviewedProductIds.has(item.product.toString()))
      .map((item) => ({ orderId: order._id, product: item.product, name: item.name }))
  );

  res.json({ success: true, data: pending });
});

// --- Admin moderation ---

export const listModerationQueue = asyncHandler(async (req: Request, res: Response) => {
  const { status, rating, product, reported } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (rating) filter.rating = Number(rating);
  if (product) filter.product = product;
  if (reported === "true") filter.reportedCount = { $gt: 0 };

  const reviews = await Review.find(filter)
    .populate("user", "name email")
    .populate("product", "name slug")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: reviews });
});

export const moderateReview = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body as { status: string };
  const validStatuses = ["pending", "approved", "rejected", "flagged"];
  if (!validStatuses.includes(status)) throw new ApiError(400, `status must be one of: ${validStatuses.join(", ")}`);

  const review = await Review.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!review) throw new ApiError(404, "Review not found");

  await recomputeProductRating(review.product.toString());
  await logAudit(req, "reviews", `moderate:${status}`, review._id.toString());
  res.json({ success: true, data: review });
});

export const reportReview = asyncHandler(async (req: Request, res: Response) => {
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { $inc: { reportedCount: 1 } },
    { new: true }
  );
  if (!review) throw new ApiError(404, "Review not found");
  res.json({ success: true, data: review });
});
