import { Request, Response } from "express";
import { Warehouse } from "../models/Warehouse";
import { StockAdjustment } from "../models/StockAdjustment";
import { Product } from "../models/Product";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { notifyStaff } from "../utils/notify";

export const listWarehouses = asyncHandler(async (_req: Request, res: Response) => {
  const warehouses = await Warehouse.find().sort({ name: 1 });
  res.json({ success: true, data: warehouses });
});

export const createWarehouse = asyncHandler(async (req: Request, res: Response) => {
  const { name, location } = req.body;
  if (!name || !location) throw new ApiError(400, "name and location are required");

  const warehouse = await Warehouse.create({ name, location });
  res.status(201).json({ success: true, data: warehouse });
});

export const listLowStock = asyncHandler(async (_req: Request, res: Response) => {
  const products = await Product.find({
    $expr: { $lte: ["$stock", "$minStock"] },
    status: { $ne: "INACTIVE" },
  }).sort({ stock: 1 });
  res.json({ success: true, data: products });
});

export const adjustStock = asyncHandler(async (req: Request, res: Response) => {
  const { productId, variantSku, warehouseId, change, reason } = req.body;
  if (!productId || change === undefined || !reason) {
    throw new ApiError(400, "productId, change and reason are required");
  }

  const product = await Product.findByIdAndUpdate(
    productId,
    { $inc: { stock: change } },
    { new: true }
  );
  if (!product) throw new ApiError(404, "Product not found");

  const adjustment = await StockAdjustment.create({
    product: productId,
    variantSku,
    warehouse: warehouseId,
    change,
    reason,
    adjustedBy: req.user!._id,
  });

  if (product.stock <= product.minStock) {
    await notifyStaff("Low stock alert", `${product.name} is at ${product.stock} units (threshold ${product.minStock}).`, product._id.toString());
  }

  res.status(201).json({ success: true, data: { adjustment, newStock: product.stock } });
});

export const listAdjustmentLog = asyncHandler(async (req: Request, res: Response) => {
  const { productId } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (productId) filter.product = productId;

  const adjustments = await StockAdjustment.find(filter)
    .populate("product", "name")
    .populate("warehouse", "name")
    .populate("adjustedBy", "name")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: adjustments });
});

export const flagReorder = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findById(req.params.productId);
  if (!product) throw new ApiError(404, "Product not found");

  await notifyStaff("Reorder requested", `A reorder was flagged for ${product.name}.`, product._id.toString());
  res.json({ success: true, data: { message: "Reorder flagged for procurement follow-up" } });
});
